// What "Start over" removes for each choice, as names inside the data
// folder. Kept apart from the code that moves files, so it can be tested.

export type ResetPart = 'history' | 'library' | 'skills' | 'presets' | 'settings'

export const RESET_PARTS: Record<ResetPart, { files: string[]; dirs: string[] }> = {
  /** Sessions and everything attached to them; challenge progress is reset separately. */
  history: { files: ['sessions.json'], dirs: ['captures', 'photos', 'kept'] },
  /** Collections, folders, favorites, and the images the app stored (pasted, Pinterest). Linked folders on disk are never touched. */
  library: { files: ['boards.json', 'library.json'], dirs: ['collections', 'cache'] },
  skills: { files: ['skills.json'], dirs: [] },
  presets: { files: ['presets.json', 'challenges.json'], dirs: [] },
  settings: { files: ['settings.json', 'window-state.json'], dirs: [] }
}

export const ALL_PARTS: ResetPart[] = ['history', 'library', 'skills', 'presets', 'settings']

/** Everything to move out of the data folder for these choices. Thumbnails always go (they are only a cache). */
export function resetTargets(parts: ResetPart[]): string[] {
  const out = new Set<string>(['thumbs'])
  for (const p of parts) {
    for (const f of RESET_PARTS[p].files) out.add(f)
    for (const d of RESET_PARTS[p].dirs) out.add(d)
  }
  return [...out]
}

/**
 * Files that must be rewritten rather than removed:
 * - history without presets & challenges: the challenges stay, their progress starts over
 * - settings: a fresh settings file that still records the data format, so
 *   the remaining data isn't mistaken for an old version
 */
export function resetRewrites(parts: ResetPart[]): { challengesProgress: boolean; freshSettings: boolean } {
  return {
    challengesProgress: parts.includes('history') && !parts.includes('presets'),
    freshSettings: parts.includes('settings')
  }
}

export interface BackupInfo {
  /** Folder name inside data/backups. */
  name: string
  createdAt: number
  /** "Before starting over", "Before an update to the data format"… */
  label: string
  /** What it holds, in words: "sessions, library, settings". */
  holds: string[]
}

/** What a backup folder holds, from the names in it. */
export function describeBackup(entries: string[]): string[] {
  const has = (n: string) => entries.includes(n)
  const out: string[] = []
  if (has('sessions.json')) out.push('history')
  if (has('boards.json') || has('library.json')) out.push('library')
  if (has('skills.json')) out.push('skills')
  if (has('presets.json') || has('challenges.json')) out.push('presets and challenges')
  if (has('settings.json')) out.push('settings')
  if (has('captures') || has('photos')) out.push('captures and photos')
  if (has('collections') || has('cache')) out.push('stored images')
  return out
}

export function backupLabel(name: string): string {
  if (name.includes('before-reset')) return 'Before starting over'
  if (name.includes('before-restore')) return 'Before a restore'
  if (name.includes('from-zip')) return 'From a backup .zip'
  if (/-v\d+$/.test(name)) return 'Before a data format update'
  return 'Backup'
}
