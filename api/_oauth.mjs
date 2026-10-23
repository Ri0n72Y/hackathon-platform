import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const FLOW_COOKIE = '__Host-lc-oauth'
export const SESSION_COOKIE = '__Host-lc-session'
export const FLOW_TTL_SECONDS = 600
const SESSION_TTL_SECONDS = 8 * 60 * 60

/** Read confidential OAuth settings; never derive the redirect URI from request headers. */
export function oauthConfig() {
  const clientId = process.env.GITHUB_APP_CLIENT_ID
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET
  const callback = process.env.GITHUB_OAUTH_CALLBACK_URL
  const secret = process.env.GITHUB_OAUTH_COOKIE_KEY
  if (!clientId || !clientSecret || !callback || !secret) {
    throw new Error('GitHub OAuth environment incomplete')
  }

  const callbackUrl = new URL(callback)
  if (callbackUrl.protocol !== 'https:' || callbackUrl.pathname !== '/api/github-callback' ||
      callbackUrl.search || callbackUrl.hash || callbackUrl.username || callbackUrl.password) {
    throw new Error('Invalid GitHub OAuth callback URL')
  }
  const key = Buffer.from(secret, 'base64url')
  if (key.length !== 32 || key.toString('base64url') !== secret) {
    throw new Error('Invalid GitHub OAuth cookie key')
  }
  return { clientId, clientSecret, callbackUrl: callbackUrl.href, origin: callbackUrl.origin, key }
}

/** Seal short-lived OAuth state and session values; authenticate their purpose with AES-GCM. */
export function seal(value, purpose, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from('labourchain:' + purpose))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), encrypted.toString('base64url'),
    cipher.getAuthTag().toString('base64url')].join('.')
}

export function unseal(value, purpose, key) {
  try {
    const parts = value?.split('.')
    if (parts?.length !== 4 || parts[0] !== 'v1') return null
    const iv = Buffer.from(parts[1], 'base64url')
    const tag = Buffer.from(parts[3], 'base64url')
    if (iv.length !== 12 || tag.length !== 16) return null
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAAD(Buffer.from('labourchain:' + purpose))
    decipher.setAuthTag(tag)
    const json = Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')),
      decipher.final()]).toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function cookieValue(request, name) {
  const cookies = request.headers.get('cookie') || ''
  const part = cookies.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))
  return part?.slice(name.length + 1) || ''
}

export function cookieHeader(name, value, maxAge) {
  return name + '=' + value + '; Path=/; Max-Age=' + maxAge +
    '; HttpOnly; Secure; SameSite=Lax'
}

export function oauthHeaders() {
  return new Headers({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  })
}

export function validOrigin(request, origin) {
  return new URL(request.url).origin === origin
}

export function newFlow(key) {
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const cookie = seal({ state, verifier, exp: Date.now() + FLOW_TTL_SECONDS * 1000 },
    'oauth', key)
  return { state, challenge, cookie }
}

export function readFlow(request, key, state) {
  const flow = unseal(cookieValue(request, FLOW_COOKIE), 'oauth', key)
  if (!flow || typeof flow.exp !== 'number' || flow.exp <= Date.now() ||
      typeof flow.state !== 'string' || typeof state !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(flow.verifier || '')) return null
  const got = Buffer.from(state)
  const expected = Buffer.from(flow.state)
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null
  return flow
}

/** Store only an encrypted, expiry-bounded user access token; no refresh tokens in cookies. */
export function sessionCookie(token, expiresIn, key) {
  const lifetime = Math.min(SESSION_TTL_SECONDS, Number(expiresIn ?? SESSION_TTL_SECONDS))
  if (!Number.isFinite(lifetime) || lifetime <= 0 || !token ||
      typeof token !== 'string') throw new Error('Invalid GitHub user token')
  const seconds = Math.floor(lifetime)
  const value = seal({ token, exp: Date.now() + seconds * 1000 }, 'session', key)
  if (value.length > 3800) throw new Error('GitHub user session too large')
  return cookieHeader(SESSION_COOKIE, value, seconds)
}

export function readSession(request) {
  const { key } = oauthConfig()
  const session = unseal(cookieValue(request, SESSION_COOKIE), 'session', key)
  if (!session || typeof session.token !== 'string' ||
      typeof session.exp !== 'number' || session.exp <= Date.now()) return null
  return session
}
