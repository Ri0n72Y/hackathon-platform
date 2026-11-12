import endpoint1 from './_repo-home.mjs'
import endpoint2 from './_repo-feed.mjs'
import endpoint3 from './_repo-member-permission.mjs'
import endpoint4 from './_repo-member-register.mjs'
import endpoint5 from './_github-installation-probe.mjs'
import endpoint6 from './_repo-config.mjs'

const handlers = Object.freeze({
  'repo-home': endpoint1,
  'repo-feed': endpoint2,
  'repo-member-permission': endpoint3,
  'repo-member-register': endpoint4,
  'github-installation-probe': endpoint5,
  'repo-config': endpoint6,
})

/** @summary Preserve each original API handler while sharing one Vercel Function slot. */
export default {
  fetch(request) {
    const route = new URL(request.url).searchParams.get('__lc_route')
    const handler = Object.hasOwn(handlers, route) ? handlers[route] : null
    return handler ? handler.fetch(request) :
      Response.json({ error: 'API route not found' }, { status: 404 })
  },
}
