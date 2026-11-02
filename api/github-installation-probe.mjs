import { oauthConfig, oauthHeaders, readSession, validOrigin } from './_oauth.mjs'
import { inspectInstallation, ProbeError } from './_installation-probe.mjs'

function json(data, status = 200) {
  return Response.json(data, { status, headers: oauthHeaders() })
}

/** Experimental read-only endpoint; does not install an App or change its repository scope. */
export default {
  async fetch(request) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
    let config
    try { config = oauthConfig() }
    catch { return json({ error: 'GitHub OAuth is not configured' }, 503) }
    if (!validOrigin(request, config.origin)) return json({ error: 'Invalid request origin' }, 400)
    if (!readSession(request)) return json({ error: 'GitHub login required', relogin: true }, 401)
    const params = new URL(request.url).searchParams
    try {
      const result = await inspectInstallation({ owner: params.get('owner'), repo: params.get('repo') })
      return json(result)
    } catch (error) {
      if (error instanceof ProbeError) return json({ error: error.message }, error.status)
      return json({ error: 'Installation verification unavailable' }, 502)
    }
  },
}
