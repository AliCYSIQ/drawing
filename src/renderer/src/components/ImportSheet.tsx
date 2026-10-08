import { useEffect, useState } from 'react'
import type { FolderImport, FolderInfo } from '@shared/types'
import { Button } from './ui'

export type ImportChoice = Exclude<FolderImport, 'ask'>

export interface ImportOptions {
  choice: ImportChoice
  /** Paths of the sub-folders to include. */
  subfolders: string[]
  copy: boolean
  remember: boolean
}

/**
 * Shown only when a folder being added has sub-folders with images. Most
 * folders don't, so most of the time nothing is asked.
 */
export function ImportSheet({
  info,
  onCancel,
  onImport
}: {
  info: FolderInfo
  onCancel: () => void
  onImport: (o: ImportOptions) => void
}) {
  const [choice, setChoice] = useState<ImportChoice>('one')
  const [picked, setPicked] = useState<string[]>(info.subfolders.map((s) => s.path))
  const [copy, setCopy] = useState(false)
  const [remember, setRemember] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const subTotal = info.subfolders.filter((s) => picked.includes(s.path)).reduce((a, s) => a + s.count, 0)
  const options: { value: ImportChoice; title: string; hint: string; disabled?: boolean }[] = [
    { value: 'one', title: 'One collection with everything', hint: `${info.direct + subTotal} images` },
    {
      value: 'split',
      title: 'A collection for each sub-folder',
      hint: `Grouped in a new folder “${info.name}”${info.direct ? `, plus one for the ${info.direct} images directly inside` : ''}`
    },
    {
      value: 'top',
      title: `Only the images directly in “${info.name}”`,
      hint: info.direct ? `${info.direct} images; sub-folders are left out` : 'There are none; the images are all in sub-folders',
      disabled: !info.direct
    }
  ]
  const nothing = choice === 'top' ? !info.direct : !info.direct && !picked.length

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-bg/70 p-6" role="dialog" aria-label="Add folder">
      <form
        className="flex max-h-full w-[min(560px,100%)] flex-col overflow-hidden rounded-lg bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.4)] ring-1 ring-line"
        onSubmit={(e) => {
          e.preventDefault()
          if (!nothing) onImport({ choice, subfolders: picked, copy, remember })
        }}
      >
        <div className="overflow-y-auto p-6">
          <h2 className="text-[17px] font-semibold">“{info.name}” has sub-folders with images</h2>
          <p className="mt-1 text-muted">How should they be added?</p>

          <fieldset className="mt-4 grid gap-2">
            <legend className="sr-only">How to add the sub-folders</legend>
            {options.map((o) => (
              <label
                key={o.value}
                className={`flex cursor-pointer items-start gap-3 rounded-md p-3 ring-1 ${
                  choice === o.value ? 'bg-blue-soft ring-blue' : 'ring-line hover:ring-muted'
                } ${o.disabled ? 'pointer-events-none opacity-45' : ''}`}
              >
                <input
                  type="radio"
                  name="choice"
                  value={o.value}
                  checked={choice === o.value}
                  disabled={o.disabled}
                  onChange={() => setChoice(o.value)}
                  className="mt-1 accent-[var(--blue)]"
                />
                <span>
                  <span className="block text-ink">{o.title}</span>
                  <span className="block text-[12.5px] text-muted">{o.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {choice !== 'top' && (
            <fieldset className="mt-4">
              <legend className="pb-2 text-muted">Sub-folders to include</legend>
              <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md p-2 ring-1 ring-line">
                {info.subfolders.map((s) => (
                  <label key={s.path} className="flex cursor-pointer items-center gap-2.5 rounded px-1.5 py-1 hover:bg-raised">
                    <input
                      type="checkbox"
                      checked={picked.includes(s.path)}
                      onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.path] : p.filter((x) => x !== s.path)))}
                      className="accent-[var(--blue)]"
                    />
                    <span className="min-w-0 flex-1 truncate text-ink">{s.name}</span>
                    <span className="tnum text-[12.5px] text-muted">{s.count}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="mt-4 grid gap-2">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} className="mt-1 accent-[var(--blue)]" />
              <span>
                <span className="block text-ink">Copy the images into the app</span>
                <span className="block text-[12.5px] text-muted">
                  Keeps working if you move or delete the originals, but uses extra disk space. Otherwise the app links to your folder.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-1 accent-[var(--blue)]" />
              <span>
                <span className="block text-ink">Remember my choice</span>
                <span className="block text-[12.5px] text-muted">Don’t ask next time. You can change this in Settings.</span>
              </span>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button tone="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button tone="primary" type="submit" disabled={nothing}>
            Add
          </Button>
        </div>
      </form>
    </div>
  )
}
