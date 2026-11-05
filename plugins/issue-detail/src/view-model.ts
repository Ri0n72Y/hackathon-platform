/** Presentation-only contracts for the Issue page. The View does not import API or domain types. */
export type IssueTab = 'discussion' | 'labour'
export type LabourField = 'work' | 'hours' | 'outcome' | 'commits' | 'start' | 'end'
export type LabourDraft = Record<LabourField, string>
export type CommentItemView = {
  id: number; author: string; time: string; body: string; sourceUrl: string | null
}
export type LabourItemView = {
  id: number; author: string; time: string; work: string; hours: number;
  outcome: string | null; occurrence: string; conflicted: boolean;
  sourceUrl: string | null; commits: Array<{ sha: string; href: string }>
}
export type FormNotice = {
  kind: 'comment' | 'labour'; tone: 'error' | 'success'; message: string
}
export type PermissionView = {
  state: 'checking' | 'anonymous' | 'authorized' | 'denied' | 'error'
  allowed: boolean; reason: string; loginHref: string | null; loginText: string
}
export type IssueDetailViewModel = {
  routeKey: string
  navigation: { homeHref: string; repositoryHref: string; repository: string }
  load: { phase: 'loading' | 'error' | 'ready'; error: string | null; statusCode: number | null }
  issue: null | {
    number: number; title: string; state: string; author: string; created: string;
    body: string; sourceUrl: string | null; updated: string
    labourSummary: {
      hours: number; complete: boolean; statusText: string;
      outcome: null | { text: string; author: string; time: string; sourceUrl: string | null };
      outcomeEmptyText: string
    }
    pagination: {
      loaded: number; expected: number; hasMore: boolean; fetchingMore: boolean;
      error: string; lastRead: string; warnings: string[]; complete: boolean
    }
    discussion: { comments: CommentItemView[]; emptyText: string }
    labour: { records: LabourItemView[]; emptyText: string; invalidCount: number }
  }
  form: {
    draft: string; labour: LabourDraft; pending: boolean;
    pendingKind: 'comment' | 'labour' | null; notice: FormNotice | null;
    permission: PermissionView
  }
}
export type IssueDetailViewActions = {
  onRetry(): void; onRefresh(): void; onLoadMore(): void
  onCommentChange(value: string): void
  onLabourChange(field: LabourField, value: string): void
  onSubmitComment(): void; onSubmitLabour(): void
}
