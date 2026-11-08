export type LabourComment = {
  work: string; hours: number; outcome: string | null; commits: string[];
  startEnd: { start: string; end: string } | null
}
export type GithubLabourComment = {
  id: number; body: string; html_url: string; created_at: string; user?: { login: string }
}
export type LabourRecord = LabourComment & { comment: GithubLabourComment; conflicted: boolean }
export function parseIssueLabels(config: string): string[]
export function validIssueForPage(issue: unknown): boolean
export function validChannelIssue(issue: unknown, allowedLabels: string[]): boolean
export function validIssueTarget(owner: string | undefined, repo: string | undefined,
  number: string | undefined): boolean
export function parseLabourComment(body: unknown): LabourComment | null
export function summarizeIssueComments(comments: GithubLabourComment[], complete: boolean): {
  records: LabourRecord[]; discussion: GithubLabourComment[]; invalidCandidates: number[];
  conflicts: string[]; hours: number; complete: boolean
}
export function formatLabourComment(input: {
  work: string; hr: number; outcome?: string; commits?: string[];
  start?: string; end?: string
}): string
