import { randomUUID } from 'node:crypto'
import { readSession } from './_oauth.mjs'
import { appJwt, resolveInstalledRepository } from './_installation-probe.mjs'
import { IssueAccessError } from './_issue-access.mjs'
import { repoFetch, pathFor, readRepo, readText, accessFor, paramsFor } from './_repo-home-access.mjs'
import { appendMemberFile, validateMemberInput } from '../plugins/repo-home/src/domain.mjs'

const deny = (msg, status = 403) => { throw new IssueAccessError(msg, status) }
async function operator(token, installationId, owner, repo) {
  const user = (await repoFetch(fetch, token, '/user')).data
  if (!Number.isSafeInteger(user.id) || !/^[a-z\d-]{1,39}$/i.test(user.login || '')) deny('OAuth 用户身份验证失败', 401)
  const fullName = (owner + '/' + repo).toLowerCase()
  let found
  for (let page = 1; page <= 5; page++) {
    const data = (await repoFetch(fetch, token, '/user/installations/' + installationId +
      '/repositories?per_page=100&page=' + page)).data
    if (!Array.isArray(data.repositories)) deny('Installation 用户授权响应无效', 502)
    found = data.repositories.find(r => r.full_name?.toLowerCase() === fullName && r.private === false)
    if (found || data.repositories.length < 100) break
    if (page === 5) deny('用户 Installation 仓库超过验证上限', 409)
  }
  if (!found) deny('当前 OAuth 用户未授权访问此仓库')
  if (found.permissions?.push !== true && found.permissions?.admin !== true &&
      found.permissions?.maintain !== true) deny('当前 OAuth 用户没有仓库写权限')
  return { login: user.login, id: user.id }
}
/** @summary Check user write authorization, actual App scopes, and the display-branch protection before any bot write. */
export async function memberWriteCapability({ owner, repo, branch, userToken }) {
  const installed = await resolveInstalledRepository({ owner, repo })
  const user = await operator(userToken, installed.installationId, owner, repo)
  const access = await accessFor(owner, repo)
  const base = pathFor(owner, repo)
  const selected = (await readRepo(access, base + '/branches/' + encodeURIComponent(branch))).data
  if (selected.name !== branch || !selected.commit?.sha) deny('目标分支不存在或不可读取', 404)
  const app = (await repoFetch(fetch, installed.jwt,
    '/app/installations/' + installed.installationId)).data
  const perms = app.permissions || {}
  if (perms.contents !== 'write') deny('LabourChain App 缺少 Contents: write 权限')
  const protectedBranch = selected.protected === true
  if (protectedBranch && perms.pull_requests !== 'write') deny('受保护分支需要 App 的 Pull requests: write 权限')
  return { ...installed, user, protectedBranch, canPullRequest: perms.pull_requests === 'write',
    branchHead: selected.commit.sha, base }
}
export async function capabilityFromRequest(request, owner, repo, branch) {
  const session = readSession(request)
  if (!session) deny('请先登录 GitHub', 401)
  return memberWriteCapability({ owner, repo, branch, userToken: session.token })
}
async function botToken(capability) {
  const scopes = { contents: 'write' }
  if (capability.protectedBranch) scopes.pull_requests = 'write'
  const data = (await repoFetch(fetch, capability.jwt,
    '/app/installations/' + capability.installationId + '/access_tokens', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repository_ids: [capability.repositoryId], permissions: scopes }),
    })).data
  if (!data.token) deny('Bot 写入令牌获取失败', 502)
  return data.token
}
async function fileAt(token, base, branch) {
  const result = await repoFetch(fetch, token, base + '/contents/team-member.json?ref=' +
    encodeURIComponent(branch), {}, true)
  if (!result) return { text: null, sha: null }
  const d = result.data
  if (d.type !== 'file' || d.encoding !== 'base64' || typeof d.content !== 'string' ||
      d.size > 1024 * 1024) deny('成员文件无效或过大', 422)
  return { text: Buffer.from(d.content.replace(/\s/g, ''), 'base64').toString('utf8'), sha: d.sha }
}
async function putFile(token, base, branch, current, content, login) {
  return repoFetch(fetch, token, base + '/contents/team-member.json', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'chore(team): register member (Requested by @' + login + ')',
      content: Buffer.from(content).toString('base64'), branch,
      ...(current.sha ? { sha: current.sha } : {}) }),
  })
}
/** @summary Submit one requested member via the bot, retaining existing members and never bypassing branch protection. */
export async function registerMember(capability, branch, rawInput) {
  const input = validateMemberInput(rawInput)
  const token = await botToken(capability)
  if (input.githubUsername) {
    await repoFetch(fetch, token, '/users/' + encodeURIComponent(input.githubUsername))
  }
  const id = randomUUID()
  let writeBranch = branch
  if (capability.protectedBranch) {
    writeBranch = 'labourchain/team-member-' + id
    await repoFetch(fetch, token, capability.base + '/git/refs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'refs/heads/' + writeBranch, sha: capability.branchHead }),
    })
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await fileAt(token, capability.base, writeBranch)
    let content
    try { content = appendMemberFile(current.text, input, id) }
    catch (error) { deny(error.message, 422) }
    try {
      const saved = (await putFile(token, capability.base, writeBranch, current, content, capability.user.login)).data
      if (!saved.commit?.sha) deny('Bot Commit 返回无效', 502)
      if (!capability.protectedBranch) return { status: 'committed', sha: saved.commit.sha,
        url: 'https://github.com/' + capability.base.slice(7) + '/commit/' + saved.commit.sha }
      const pr = (await repoFetch(fetch, token, capability.base + '/pulls', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'chore(team): register member (Requested by @' + capability.user.login + ')',
          body: 'Requested by @' + capability.user.login + '\n\nGitHub operator: https://github.com/' +
            capability.user.login + '\n\nThis PR adds one team-member.json entry. Review and merge manually.',
          head: writeBranch, base: branch, draft: false,
        }),
      })).data
      if (!pr.html_url) deny('Bot PR 返回无效', 502)
      return { status: 'pending_pr', url: pr.html_url, sha: saved.commit.sha }
    } catch (error) {
      if (error.status !== 409 && error.status !== 422) throw error
      if (attempt === 2) deny('并发修改冲突，请检查仓库后重试', 409)
    }
  }
}
