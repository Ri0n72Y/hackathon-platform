import endpoint1 from './_issue-detail.mjs'
import endpoint2 from './_issue-comments.mjs'
import endpoint3 from './_issue-config.mjs'

const handlers = Object.freeze({
  'issue-detail': endpoint1,
  'issue-comments': endpoint2,
  'issue-config': endpoint3,
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
