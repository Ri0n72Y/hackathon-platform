import { content, errorResponse, github, json, parseYaml, repoPath, validRepo } from './_topic.mjs'

export default { async fetch(request) {
  const params = new URL(request.url).searchParams
  const owner = params.get('owner'), repo = params.get('repo')
  if (!validRepo(owner, repo)) return json({ error: 'TopicPage 路由中的仓库参数无效', stage: 'route' }, 400)
  try {
    const repository = await github(repoPath(owner, repo))
    if (repository.private) return json({ error: 'TopicPage 只支持公开仓库', stage: 'repository' }, 403)
    const readme = await content(owner, repo, 'README.md')
    const config = parseYaml(await content(owner, repo, 'topics.config.yaml'))
    if (typeof config.topic !== 'string' || !config.topic.trim()) {
      return json({ error: 'topics.config.yaml 缺少有效的 topic 字段', stage: 'config' }, 422)
    }
    const whitelist = config.whitelist !== false
    const allowed = []
    if (whitelist) {
      const entries = await github(repoPath(owner, repo, '/contents/projects'))
      if (!Array.isArray(entries)) throw new Error('projects 目录格式异常')
      for (const entry of entries.filter(item => /\.ya?ml$/i.test(item.name))) {
        try {
          const project = parseYaml(await content(owner, repo, entry.path))
          if (typeof project.repository === 'string') allowed.push(project.repository.toLowerCase())
        } catch { /* malformed entries are ignored by the data source; the page still reports usable entries */ }
      }
    }
    return json({ repository: { owner, name: repo, full_name: repository.full_name, html_url: repository.html_url }, readme, coverUrl: 'https://raw.githubusercontent.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/HEAD/cover.jpg', config: { topic: config.topic.trim(), whitelist }, allowedRepositories: allowed })
  } catch (error) {
    return errorResponse(error, error?.status === 404 ? 'repository' : 'source')
  }
} }
