import { IssueAccessError } from './_issue-access.mjs'
import { paramsFor, accessFor, pathFor, readRepo, reply, issueError } from './_repo-home-access.mjs'
import { decodeConfigFile } from './_repo-config-preview.mjs'
import { parseConfigNamespaces } from '../plugins/repo-config/src/domain.mjs'
import { selectChannelIssues } from '../plugins/channel/src/domain.mjs'

const NEXT = /<[^>]+>;\s*rel="next"/
const SHA = /^[a-f0-9]{40}$/i
const MAX_ISSUE_PAGES = 10

/** @summary Read main-only Channel configuration and complete Open Issue pages without writes. */
export function createRepoChannelsHandler({
  accessFactory = accessFor, read = readRepo, maxPages = MAX_ISSUE_PAGES,
} = {}) {
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 50) {
    throw new Error('Invalid Channel pagination limit')
  }
  return {
    async fetch(request) {
      if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405)
      try {
        const { owner, repo, branch } = paramsFor(request)
        if (branch !== 'main') throw new IssueAccessError(
          'Channel 配置仅从 main 生效；不接受其他分支参数', 400)
        const base = pathFor(owner, repo), access = await accessFactory(owner, repo)
        let selected
        try { selected = await read(access, base + '/branches/main') }
        catch (error) {
          if (error?.status === 404) return reply({
            state: 'sync_branch_missing', channels: [], branch: 'main',
          })
          throw error
        }
        if (selected?.data?.name !== 'main' ||
            !SHA.test(selected.data?.commit?.sha || '')) {
          throw new IssueAccessError('main 分支返回了无效元数据', 502)
        }
        const headSha = selected.data.commit.sha
        const source = await read(access,
          base + '/contents/labourchain.config.yaml?ref=main', true)
        if (!source) return reply({
          state: 'config_missing', channels: [], branch: 'main', headSha,
        })
        const content = decodeConfigFile(source.data)
        const config = parseConfigNamespaces(content === null ? '' : content)
        if (config.state !== 'ready') return reply({
          state: 'invalid_config', channels: [], branch: 'main', headSha,
        })
        if (!Array.isArray(config.namespaces.channel) ||
            config.namespaces.channel.length === 0) return reply({
          state: 'no_channels', channels: [], branch: 'main', headSha,
        })

        const issues = []
        for (let page = 1; page <= maxPages; page++) {
          const result = await read(access, base +
            '/issues?state=open&sort=created&direction=desc&per_page=100&page=' + page)
          if (!Array.isArray(result?.data)) {
            throw new IssueAccessError('GitHub Open Issues 分页格式无效', 502)
          }
          issues.push(...result.data)
          const hasNext = NEXT.test(result.link || '')
          if (!hasNext) {
            let channels
            try { channels = selectChannelIssues(config, issues) }
            catch { throw new IssueAccessError('GitHub Channel Issue 数据无效或重复', 502) }
            return reply({ state: 'ready', branch: 'main', headSha,
              channels, scannedIssues: issues.length, pages: page })
          }
          if (result.data.length === 0) throw new IssueAccessError(
            'GitHub 分页标识指向空页', 502)
        }
        // Never publish a potentially incorrect "newest" Channel from partial pages.
        return reply({ state: 'snapshot_incomplete', channels: [], branch: 'main',
          headSha, scannedIssues: issues.length, pages: maxPages,
          error: 'Open Issues 分页超过有界读取上限，无法确定最新频道 Issue' })
      } catch (error) { return issueError(error) }
    },
  }
}

export default createRepoChannelsHandler()
