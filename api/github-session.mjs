import { oauthHeaders, readSession } from './_oauth.mjs'

/** @summary Report the local GitHub OAuth session state without exposing the token. */
export default {
  async fetch(request) {
    const headers = oauthHeaders()
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers })
    try {
      return Response.json({ authenticated: Boolean(readSession(request)) }, { headers })
    } catch {
      return Response.json({ error: 'Session check unavailable' }, { status: 503, headers })
    }
  },
}
