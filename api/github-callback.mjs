import { FLOW_COOKIE, cookieHeader, oauthConfig, oauthHeaders,
  readFlow, sessionCookie, validOrigin } from './_oauth.mjs'

function fail(status, message, headers) {
  headers.append('Set-Cookie', cookieHeader(FLOW_COOKIE, '', 0))
  return new Response(message, { status, headers })
}

/** Validate OAuth state and PKCE, exchange the code on the server, and seal the user session. */
export default {
  async fetch(request) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
    const headers = oauthHeaders()
    let config
    try {
      config = oauthConfig()
    } catch {
      return fail(503, 'GitHub login is not configured', headers)
    }
    if (!validOrigin(request, config.origin)) {
      return fail(400, 'Invalid login origin', headers)
    }

    const params = new URL(request.url).searchParams
    if (params.has('error')) return fail(400, 'GitHub authorization was denied', headers)
    const code = params.get('code')
    const flow = readFlow(request, config.key, params.get('state'))
    if (!flow || !code || !/^[A-Za-z0-9_-]{1,512}$/.test(code)) {
      return fail(400, 'Invalid or expired GitHub login attempt', headers)
    }

    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: config.callbackUrl,
          code_verifier: flow.verifier,
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) return fail(502, 'GitHub token exchange failed', headers)
      const result = await response.json()
      if (result.error || !result.access_token || result.token_type?.toLowerCase() !== 'bearer') {
        return fail(502, 'GitHub token exchange failed', headers)
      }

      headers.append('Set-Cookie', sessionCookie(result.access_token, result.expires_in, config.key))
      headers.append('Set-Cookie', cookieHeader(FLOW_COOKIE, '', 0))
      headers.set('Location', config.origin + '/')
      return new Response(null, { status: 303, headers })
    } catch {
      return fail(502, 'GitHub login failed', headers)
    }
  },
}
