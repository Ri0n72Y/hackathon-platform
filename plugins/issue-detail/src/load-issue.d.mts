import type { GithubComment, GithubIssue, IssueDetailApi } from './service'

/** Typed public interface for the testable, Node-compatible universal Issue reader. */
export declare function loadIssueContent(
  service: Pick<IssueDetailApi, 'getIssue' | 'getComments'>,
  owner: string,
  repo: string,
  number: number,
  signal: AbortSignal,
): Promise<null | {
  issue: GithubIssue
  first: { items: GithubComment[]; hasMore: boolean }
}>
