export type ConfigNamespaces = Record<string, string[]>
export type ParsedConfig =
  | { state: 'config_missing'; defaultPreview: string }
  | { state: 'invalid_config'; error: string }
  | { state: 'ready'; namespaces: ConfigNamespaces }
export function defaultConfigPreview(): string
export function parseConfigNamespaces(text: string | null): ParsedConfig
export function planLabelChanges(config: ParsedConfig, labels: Array<string | { name: string }>,
  issues: Array<Record<string, unknown>>, options?: { complete?: boolean }): {
    state: string
    createLabels: Array<{ name: string }>
    removeIssueLabels: Array<{ number: number; labels: string[] }>
    impact: { definitions: number; issues: number; removals: number }
    hasChanges: boolean
    requiresConfirmation: boolean
  }
