export type ChannelSelection = {
  label: string
  name: string
  issue: {
    number: number
    title: string
    createdAt: string
    comments: number
    author: string | null
  } | null
}
export function selectChannelIssues(config: {
  state: string
  namespaces?: Record<string, string[]>
}, issues: Array<Record<string, unknown>>): ChannelSelection[]
export function channelTargetKey(owner: string, repo: string): string
