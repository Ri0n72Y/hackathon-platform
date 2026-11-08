import { validIssueForPage } from './domain.mjs'

/** @summary Load one universal GitHub Issue and its first comment page without Config reads. */
export async function loadIssueContent(service, owner, repo, number, signal) {
  const issue = await service.getIssue(owner, repo, number, signal)
  if (!validIssueForPage(issue) || issue.number !== number) return null
  const first = await service.getComments(owner, repo, number, 1, signal)
  return { issue, first }
}
