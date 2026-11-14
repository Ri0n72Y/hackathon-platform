import { requireTopicTarget, github, repoPath, content, publicRepository,
  topicConfig, topicError, TopicFetchError, reply } from './_topic.mjs'
import { parseTopicYaml } from '../plugins/topic-page/src/domain.mjs'

/** @summary Read a public Topic source and safely diagnose malformed project declarations. */
export function createTopicPageEndpoint({ fetcher = fetch, logger = console } = {}) {
  return {
    async fetch(request) {
      if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405)
      try {
        const { owner, repo } = requireTopicTarget(request)
        const args = { fetcher }
        const repository = await publicRepository(owner, repo, args)
        const readme = await content(owner, repo, 'README.md', { ...args, stage: 'readme' })
        const config = await topicConfig(owner, repo, args)
        let coverUrl = null
        try {
          const cover = await github(repoPath(owner, repo, '/contents/cover.jpg'),
            { ...args, stage: 'cover' })
          if (cover?.type === 'file' && typeof cover.download_url === 'string') {
            const u = new URL(cover.download_url)
            if (u.protocol === 'https:' &&
                ['raw.githubusercontent.com', 'github.com'].includes(u.hostname)) {
              coverUrl = u.href
            }
          }
        } catch (error) {
          if (!(error instanceof TopicFetchError && error.status === 404)) throw error
        }
        const allowedRepositories = []
        if (config.whitelist) {
          let files
          try {
            files = await github(repoPath(owner, repo, '/contents/projects'),
              { ...args, stage: 'whitelist' })
          } catch (error) {
            if (!(error instanceof TopicFetchError && error.status === 404)) throw error
            files = []
          }
          if (!Array.isArray(files)) throw new TopicFetchError(
            'projects 目录格式无效', 422, 'whitelist')
          for (const entry of files.filter(item => item && typeof item.name === 'string' &&
            /\.ya?ml$/i.test(item.name))) {
            const path = entry.path
            if (typeof path !== 'string' || !/^projects\/[a-z\d._-]+\.ya?ml$/i.test(path)) {
              logger.error('Topic whitelist file rejected:', String(path).slice(0, 150))
              continue
            }
            try {
              const data = await content(owner, repo, path, { ...args, stage: 'whitelist' })
              allowedRepositories.push(parseTopicYaml(data, 'project').repository)
            } catch (error) {
              // Safe diagnostic only: no tokens, cookies, request headers or response bodies.
              logger.error('Topic whitelist file skipped:', path,
                error instanceof Error ? error.message : 'Invalid project file')
            }
          }
        }
        return reply({
          repository: { owner, name: repo, full_name: repository.full_name,
            html_url: repository.html_url },
          readme, coverUrl, config, allowedRepositories: [...new Set(allowedRepositories)],
        })
      } catch (error) { return topicError(error) }
    },
  }
}
export default createTopicPageEndpoint()
