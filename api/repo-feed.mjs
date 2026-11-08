import { paramsFor, accessFor, pathFor, reply, issueError, readRepo } from './_repo-home-access.mjs'
/** @summary Return the next raw GitHub page cursor while omitting PR objects from visible issues. */
export default {
  async fetch(request) {
    if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405)
    try {
      const { owner, repo, page } = paramsFor(request, true)
      const rawLabels = new URL(request.url).searchParams.get('labels')
      const labels = rawLabels ? rawLabels.split(',').map(label => label.trim()) : []
      if (labels.length > 10 || labels.some(label => !label || label.length > 50)) {
        return reply({ error: 'Issue Labels 过滤参数无效' }, 400)
      }
      const access = await accessFor(owner, repo)
      const filters = labels.length ? '&labels=' + encodeURIComponent(labels.join(',')) : ''
      const result = await readRepo(access, pathFor(owner, repo) +
        '/issues?state=all&sort=updated&direction=desc&per_page=20&page=' + page + filters)
      if (!Array.isArray(result.data)) return reply({ error: 'GitHub Issues 分页无效' }, 502)
      return reply({ items: result.data.filter(i => !i.pull_request &&
        Number.isSafeInteger(i.id) && Number.isSafeInteger(i.number)),
        hasMore: /<[^>]+>;\s*rel="next"/.test(result.link), page })
    } catch (error) { return issueError(error) }
  },
}
