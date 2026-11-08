export type Member = { id: string; name: string; role?: string; bio?: string; githubUsername?: string; avatarUrl?: string; links?: Array<{ label: string; url: string }> }
export type TeamState = { state: 'missing' | 'invalid' | 'empty' | 'ready'; members: Member[]; error?: string }
export function parseTeamFile(text: string | null): TeamState
export function safeHttps(value: unknown): boolean
export function validLogin(value: unknown): boolean
export function validateMemberInput(raw: unknown): Omit<Member,'id'>
export function appendMemberFile(text: string | null, input: Omit<Member,'id'>, id: string): string
export function summarizeReadme(markdown: string, repoName: string): string
export function previewMarkdown(body: string, budget?: number): string
