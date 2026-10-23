import { FLOW_COOKIE, FLOW_TTL_SECONDS, cookieHeader, newFlow, oauthConfig,
  oauthHeaders, validOrigin } from './_oauth.mjs'

/** Start a GitHub App OAuth authorization-code flow with PKCE S256 and CSRF state. */
export default {
  async fetch(request) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
    let config
    try {
      config = oauthConfig()
    } catch {
      return new Response('GitHub login is not configured', { status: 503,
        headers: oauthHeaders() })
    }
    if (!validOrigin(request, config.origin)) {
      return new Response('Use the configured login domain', { status: 400,
        headers: oauthHeaders() })
    }

    const { state, challenge, cookie } = newFlow(config.key)
    const authorize = new URL('https://github.com/login/oauth/authorize')
    authorize.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString()

    const headers = oauthHeaders()
    headers.set('Location', authorize.href)
    headers.append('Set-Cookie', cookieHeader(FLOW_COOKIE, cookie, FLOW_TTL_SECONDS))
    return new Response(null, { status: 302, headers })
  },
}
