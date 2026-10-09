import { describe, expect, it } from 'vitest'
import { ALL_PARTS, backupLabel, describeBackup, resetRewrites, resetTargets } from '@shared/reset'

describe('start over', () => {
  it('everything takes every data file and folder, and the thumbnail cache', () => {
    const t = resetTargets(ALL_PARTS)
    for (const name of ['sessions.json', 'boards.json', 'library.json', 'skills.json', 'presets.json', 'challenges.json', 'settings.json', 'captures', 'photos', 'kept', 'collections', 'cache', 'thumbs']) {
      expect(t).toContain(name)
    }
    // Logs and earlier backups always stay.
    expect(t).not.toContain('logs')
    expect(t).not.toContain('backups')
  })

  it('keeping the library leaves collections, folders and their stored images', () => {
    const t = resetTargets(['history', 'skills', 'presets', 'settings'])
    expect(t).not.toContain('boards.json')
    expect(t).not.toContain('library.json')
    expect(t).not.toContain('collections')
    expect(t).not.toContain('cache')
    expect(t).toContain('sessions.json')
  })

  it('history alone keeps challenges but resets their progress; settings get a fresh file with the data format', () => {
    expect(resetRewrites(['history'])).toEqual({ challengesProgress: true, freshSettings: false })
    expect(resetRewrites(['history', 'presets'])).toEqual({ challengesProgress: false, freshSettings: false })
    expect(resetRewrites(['settings']).freshSettings).toBe(true)
  })
})

describe('backups', () => {
  it('say what they hold and where they came from', () => {
    expect(describeBackup(['sessions.json', 'boards.json', 'captures', 'settings.json'])).toEqual(['history', 'library', 'settings', 'captures and photos'])
    expect(backupLabel('2026-10-09-10-00-00-before-reset')).toBe('Before starting over')
    expect(backupLabel('2026-10-09-10-00-00-v1')).toBe('Before a data format update')
  })
})
