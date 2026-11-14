/** @summary Keep the one site-wide theme preference without relying on storage availability. */
export type ThemeMode = 'dark' | 'light'
export const THEME_STORAGE_KEY = 'labourchain.theme'

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>

function storageOrNull(storage?: ThemeStorage | null): ThemeStorage | null {
  if (storage !== undefined) return storage
  return typeof window === 'undefined' ? null : window.localStorage
}

/** @summary Accept only persisted dark/light values and default safely to Dark. */
export function readStoredTheme(storage?: ThemeStorage | null): ThemeMode {
  try { return storageOrNull(storage)?.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark' }
  catch { return 'dark' }
}

/** @summary Best-effort persistence; a denied storage write never blocks UI state. */
export function persistTheme(mode: ThemeMode, storage?: ThemeStorage | null): void {
  try { storageOrNull(storage)?.setItem(THEME_STORAGE_KEY, mode) }
  catch { /* private browsing or disabled localStorage: retain the in-memory choice */ }
}
