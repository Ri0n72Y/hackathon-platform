/** Public Topic source metadata required by the cross-runtime paging helpers. */
export type TopicCandidate = { full_name: string; html_url: string }
export type TopicCandidatesMeta = {
  repository: { full_name: string };
  config: { whitelist: boolean };
  allowedRepositories: string[]
}
export type TopicCandidatePage<T extends TopicCandidate> = {
  page: number; perPage: number; hasNext: boolean; windowExhausted: boolean;
  items: T[]
}
export type TopicCandidateSummary<T extends TopicCandidate> = {
  items: T[]; ended: boolean; windowExhausted: boolean
}

export function validTopicRepository(owner: unknown, repo: unknown): boolean

/** @summary Report the exact validated scalar shape for each YAML document kind. */
export function parseTopicYaml(source: unknown, kind: 'project'): { repository: string }
export function parseTopicYaml(source: unknown, kind?: 'config'): {
  topic: string; whitelist: boolean
}
export function parseTopicYaml(source: unknown, kind: 'config' | 'project'):
  { repository: string } | { topic: string; whitelist: boolean }

export function readmeFields(readme: string): {
  title: string; description: string; email: string; datetime: string
}

/** @summary Preserve full caller repository records while applying the whitelist. */
export function accumulateTopicProjects<T extends TopicCandidate>(
  meta: TopicCandidatesMeta,
  pages: Array<Pick<TopicCandidatePage<T>, 'hasNext' | 'windowExhausted' | 'items'>>,
  minimum?: number
): TopicCandidateSummary<T>

export function topicTargetKey(owner: string, repo: string): string

/** @summary Return the original repository type after bounded, abortable pagination. */
export function loadTopicProjectCandidates<T extends TopicCandidate>(
  meta: TopicCandidatesMeta,
  getPage: (page: number) => Promise<TopicCandidatePage<T>>,
  signal?: AbortSignal,
  minimum?: number
): Promise<TopicCandidateSummary<T> & { pagesRead: number }>
