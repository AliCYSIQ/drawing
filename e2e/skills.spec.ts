import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeFixtures } from './make-fixtures'

let app: ElectronApplication
let page: Page
let dataDir: string
let refsDir: string

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'drawing-skills-'))
  refsDir = mkdtempSync(join(tmpdir(), 'refs-'))
  makeFixtures(refsDir, 3)
  app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, DRAWING_DATA_DIR: dataDir }
  })
  page = await app.firstWindow()
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as typeof dialog.showOpenDialog
  }, refsDir)
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: 'Add folder' }).click()
  await expect(page.getByText(/Added 3 images/)).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(refsDir, { recursive: true, force: true })
})

const nav = (name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true })
const skillRadio = (name: string) => page.getByRole('radiogroup', { name: 'Skill' }).getByRole('radio', { name, exact: true })
const skillRow = (name: string) => page.getByRole('row', { name: new RegExp(`^${name}`) })

/** A 4-second, one-pose session without review. */
async function shortSession() {
  const review = page.getByRole('switch', { name: /Review afterwards/ })
  if ((await review.getAttribute('aria-checked')) === 'true') await review.click()
  await page.getByRole('radio', { name: 'Classic' }).click()
  await page.getByRole('spinbutton', { name: 'Custom seconds' }).fill('4')
  await page.getByRole('spinbutton', { name: 'Number of poses' }).fill('1')
  await page.getByRole('button', { name: 'Start drawing' }).click()
  await expect(page.getByText('Session saved.')).toBeVisible({ timeout: 15_000 })
}

test('skills: add in Settings, pick on Practice, remembered next time, totals in Stats', async () => {
  await page.getByRole('button', { name: 'Settings' }).click()
  for (const name of ['Gesture', 'Hands']) {
    await page.getByRole('textbox', { name: 'New skill name' }).fill(name)
    await page.keyboard.press('Enter')
  }
  await expect(page.getByRole('textbox', { name: 'Name of skill Hands' })).toBeVisible()

  await nav('Practice').click()
  await skillRadio('Gesture').click()
  await shortSession()
  // The next session starts with the same skill.
  await expect(skillRadio('Gesture')).toHaveAttribute('aria-checked', 'true')

  // A new skill can be added right from the picker, and it gets picked.
  await page.getByRole('button', { name: 'New skill' }).click()
  await page.getByRole('textbox', { name: 'New skill name' }).fill('Anatomy')
  await page.keyboard.press('Enter')
  await expect(skillRadio('Anatomy')).toHaveAttribute('aria-checked', 'true')
  await shortSession()

  await nav('Stats').click()
  await expect(skillRow('Gesture')).toContainText('1')
  await expect(skillRow('Anatomy')).toContainText('1')
  await expect(skillRow('Hands')).toContainText('Not yet')

  // The filter narrows the heatmap, figures and history to one skill.
  await page.getByRole('radiogroup', { name: 'Show stats for' }).getByRole('radio', { name: 'Hands' }).click()
  await expect(page.getByText('No sessions for Hands yet')).toBeVisible()
  await page.getByRole('radiogroup', { name: 'Show stats for' }).getByRole('radio', { name: 'Gesture' }).click()
  await expect(page.getByRole('heading', { name: 'Recent sessions: Gesture' })).toBeVisible()
  await expect(page.getByRole('list').last().getByRole('listitem')).toHaveCount(1)
})

test("review can change a session's skill; deleting a skill keeps its sessions", async () => {
  await page.getByRole('radiogroup', { name: 'Show stats for' }).getByRole('radio', { name: 'All skills' }).click()
  await page.getByRole('button', { name: /· Gesture/ }).click()
  const select = page.getByRole('combobox', { name: /^Skill/ })
  await select.selectOption({ label: 'Hands' })
  // With the dropdown still focused, review keys work and don't change the skill.
  await select.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('r')
  await expect(select.locator('option:checked')).toHaveText('Hands')
  await expect(page.getByRole('button', { name: /Draw this one again/ })).toHaveAttribute('aria-pressed', 'true')
  await nav('Stats').click()
  await expect(skillRow('Hands')).toContainText('1')
  await expect(skillRow('Gesture')).toContainText('Not yet')

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Delete skill Anatomy' }).click()
  await page.getByRole('button', { name: 'Delete Anatomy' }).click()
  await page.getByRole('textbox', { name: 'Name of skill Hands' }).fill('Hand studies')
  await page.keyboard.press('Enter')

  await nav('Stats').click()
  await expect(skillRow('No skill')).toContainText('1')
  await expect(skillRow('Hand studies')).toContainText('1')
  await expect(skillRow('Anatomy')).toHaveCount(0)
})

test('a challenge carries its skill into its sessions', async () => {
  await nav('Challenges').click()
  await page.getByRole('button', { name: /Speed ladder/ }).click()
  await skillRadio('Gesture').click()
  await page.getByRole('button', { name: 'Create challenge' }).click()
  await expect(page.getByText('Counts toward Gesture')).toBeVisible()

  await page.getByRole('button', { name: 'Start level' }).click()
  await page.waitForTimeout(3500)
  await page.keyboard.press('Escape')
  await expect(page.getByText('Session saved.')).toBeVisible()

  await nav('Stats').click()
  await expect(skillRow('Gesture')).toContainText('1')
})
