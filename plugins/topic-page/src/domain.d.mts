export function validTopicRepository(owner: unknown, repo: unknown): boolean
export function parseTopicYaml(source: unknown, kind?: 'config' | 'project'):
  { topic: string; whitelist: boolean } & { repository?: string }
export function readmeFields(readme: string): {
  title: string; description: string; email: string; datetime: string
}
export function accumulateTopicProjects(meta: {
  repository: { full_name: string }; config: { whitelist: boolean };
  allowedRepositories: string[]
}, pages: Array<{
  hasNext: boolean; windowExhausted: boolean;
  items: Array<{ full_name: string; html_url: string }>
}>, minimum?: number): {
  items: Array<{ full_name: string; html_url: string }>
  ended: boolean; windowExhausted: boolean
}
export function topicTargetKey(owner: string, repo: string): string

export function loadTopicProjectCandidates(meta: {
  repository: { full_name: string }; config: { whitelist: boolean };
  allowedRepositories: string[]
}, getPage: (page: number) => Promise<{
  page: number; perPage: number; hasNext: boolean; windowExhausted: boolean;
  items: Array<{ full_name: string; html_url: string }>
}>, signal?: AbortSignal, minimum?: number): Promise<{
  items: Array<{ full_name: string; html_url: string }>
  ended: boolean; windowExhausted: boolean; pagesRead: number
}>
