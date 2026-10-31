// Small helpers the end-to-end tests share.
import type { Page } from '@playwright/test'
import type { LibraryData } from '../src/shared/types'

/** Library → Add → Folder from disk… (the test answers the folder dialog itself). */
export async function addFolder(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Folder from disk…' }).click()
}

/** The library as saved (after the save delay). */
export async function savedLibrary(page: Page): Promise<LibraryData> {
  await page.waitForTimeout(400)
  return (await page.evaluate(() => window.api.load<LibraryData>('library')))!
}

/** A folder tile in the Library or the Practice picker, by its name. */
export const folderTile = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name: typeof name === 'string' ? new RegExp(`^${escape(name)}, folder`) : name })

/** An image tile in the Library, by its name. */
export const imageTile = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name: typeof name === 'string' ? new RegExp(`^${escape(name)}, image$`) : name })

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
