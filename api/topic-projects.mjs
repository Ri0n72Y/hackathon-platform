import { errorResponse, github, json, repoPath, validRepo } from './_topic.mjs'

export default { async fetch(request) {
  const params = new URL(request.url).searchParams
  const owner = params.get('owner'), repo = params.get('repo')
  const page = Math.max(1, Math.min(34, Number(params.get('page') || 1)))
  if (!validRepo(owner, repo) || !Number.isInteger(page)) return json({ error: 'TopicPage 项目查询参数无效', stage: 'route' }, 400)
  try {
    const config = await (await import('./_topic.mjs')).content(owner, repo, 'topics.config.yaml')
    const topic = (await import('./_topic.mjs')).parseYaml(config).topic
    if (typeof topic !== 'string' || !topic.trim()) return json({ error: 'topics.config.yaml 缺少有效的 topic 字段', stage: 'config' }, 422)
    const data = await github('/search/repositories?q=topic:' + encodeURIComponent(topic.trim()) + '&sort=updated&order=desc&per_page=30&page=' + page)
    return json({ page, perPage: 30, totalCount: data.total_count, hasNext: page * 30 < data.total_count, items: data.items.map(item => ({ full_name: item.full_name, name: item.name, owner: item.owner?.login, description: item.description || '', html_url: item.html_url, stargazers_count: item.stargazers_count, language: item.language })) })
  } catch (error) { return errorResponse(error, error?.status === 403 ? 'topic-search' : 'projects') }
} }
