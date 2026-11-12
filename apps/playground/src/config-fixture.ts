import type { ConfigActionResult, ConfigSnapshot, RepoConfigApi } from
  '../../../plugins/repo-config/src/service'
import { RepoConfigError } from '../../../plugins/repo-config/src/service'

const CONFIG = 'namespaces:\n  status:\n    - todo\n    - doing\n    - review\n    - done\n    - archived\n  channel: [wishlist]\n'
const DEFAULT = 'namespaces:\n  status:\n    - todo\n    - doing\n    - review\n    - done\n    - archived\n  channel:\n    - wishlist\n'
const plan = {
  createLabels: [{ name: 'status:review' }],
  removeIssueLabels: [{ number: 12, labels: ['status:obsolete'] }],
  impact: { definitions: 1, issues: 1, removals: 1 },
  hasChanges: true,
  requiresConfirmation: true,
}
const capability = (denied: boolean) => ({
  state: 'ready',
  user: { login: 'fixture-operator', id: 123 },
  userPermissions: { pull: true, triage: true, push: !denied, maintain: false, admin: false },
  appPermissions: { contents: 'write', issues: 'write', pull_requests: 'write' },
  protectedBranch: true,
  canSaveConfig: !denied,
  canCreateLabels: !denied,
  canRemoveLabels: true,
})

/** @summary Exercise Config states, PR handoff, confirmation and partial recovery without GitHub writes. */
export function createRepoConfigFixtureService(query: URLSearchParams): RepoConfigApi {
  const mode = query.get('configCase') || 'changes'
  let content = mode === 'missing' ? null : mode === 'invalid' ?
    'namespaces:\n  status: [todo\n' : CONFIG
  let synced = mode === 'no-changes'
  return {
    async get(_owner, _repo, signal): Promise<ConfigSnapshot> {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const denied = mode === 'denied'
      if (mode === 'missing' && content === null) return {
        state: 'config_missing', branch: 'main', headSha: 'a'.repeat(40),
        fileSha: null, configText: null,
        config: { state: 'config_missing', defaultPreview: DEFAULT },
        capability: capability(denied),
      }
      if (mode === 'invalid') return {
        state: 'invalid_config', branch: 'main', headSha: 'a'.repeat(40),
        fileSha: 'b'.repeat(40), configText: content,
        config: { state: 'invalid_config', error: '受控无效 YAML' },
        capability: capability(denied),
      }
      return {
        state: synced ? 'ready' : 'sync_pending',
        branch: 'main', headSha: 'a'.repeat(40),
        fileSha: 'b'.repeat(40), configText: content || CONFIG,
        config: { state: 'ready', namespaces: { status: ['status:todo'] } },
        snapshotId: 'c'.repeat(64),
        counts: { labels: 4, issueObjects: 24 },
        plan: synced ? {
          createLabels: [], removeIssueLabels: [],
          impact: { definitions: 0, issues: 0, removals: 0 },
          hasChanges: false, requiresConfirmation: false,
        } : plan,
        capability: capability(denied),
      }
    },
    async save(_owner, _repo, next, _head, _file, signal): Promise<ConfigActionResult> {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (mode === 'denied') throw new RepoConfigError('模拟：当前用户没有仓库写权限', 403, 'user_permission_missing')
      content = next
      if (mode === 'pr') return {
        state: 'awaiting_pr_merge',
        prUrl: 'https://github.com/octocat/Hello-World/pull/88',
        prNumber: 88,
        branch: 'labourchain/config-fixture',
        commitSha: 'd'.repeat(40),
      }
      return { state: 'sync_pending', commitSha: 'd'.repeat(40), fileSha: 'e'.repeat(40) }
    },
    async sync(_owner, _repo, _previewId, confirmed, signal): Promise<ConfigActionResult> {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (plan.requiresConfirmation && !confirmed) {
        throw new RepoConfigError('请先确认清理清单', 400, 'confirmation_required')
      }
      if (mode === 'partial') return {
        state: 'partial_failure',
        createdLabels: ['status:review'],
        removedAssociations: [],
        failed: [{ kind: 'remove_issue_label', number: 12, label: 'status:obsolete',
          error: '模拟：GitHub API 限流', retryAfter: '60' }],
      }
      synced = true
      return { state: 'ready', createdLabels: ['status:review'], removedAssociations: 1 }
    },
  }
}
