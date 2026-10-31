import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Close, Float, Flip, Grey, Star } from '../components/Icons'
import { Stage } from '../components/Stage'
import { IconButton } from '../components/ui'
import { assetMap, imagesIn, sortItems, type SortKey } from '../lib/library'
import { useApp } from '../store'

/**
 * Look at the images of a folder without a timer; works in float mode next
 * to Clip Studio. Scroll zooms, drag moves, double-click fits again.
 */
export function Viewer({ entryId }: { entryId: string }) {
  const library = useApp((s) => s.library)
  const sort = (useApp((s) => s.settings.librarySort) ?? 'name') as SortKey
  const go = useApp((s) => s.go)
  const float = useApp((s) => s.float)
  const setFloat = useApp((s) => s.setFloat)
  const setLibrary = useApp((s) => s.setLibrary)
  const [flip, setFlip] = useState(false)
  const [grey, setGrey] = useState(false)

  const entry = library.images.find((i) => i.id === entryId)
  const assets = useMemo(() => assetMap(library.assets), [library.assets])
  // The images of its folder, in the order the library shows them.
  const list = useMemo(
    () => (entry ? sortItems(imagesIn(library.images, entry.folderId), sort === 'size' ? 'name' : sort, () => 0, () => 0) : []),
    [library.images, entry, sort]
  )
  const index = list.findIndex((i) => i.id === entryId)
  const count = list.length
  const folder = library.folders.find((f) => f.id === entry?.folderId)

  const step = (d: number) => count && go({ name: 'viewer', folderId: entry?.folderId, entryId: list[(index + d + count) % count].id })
  const close = () => {
    if (float.on) setFloat({ on: false })
    go({ name: 'library', folderId: entry?.folderId })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'Escape') close()
      else if (e.key.toLowerCase() === 'f') setFlip((v) => !v)
      else if (e.key.toLowerCase() === 'g') setGrey((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!entry || index < 0) return null
  const asset = assets.get(entry.assetId)
  const favorite = library.favoriteImages.includes(entry.assetId)
  const toggleFavorite = () =>
    setLibrary((l) => ({
      ...l,
      favoriteImages: favorite ? l.favoriteImages.filter((x) => x !== entry.assetId) : [...l.favoriteImages, entry.assetId]
    }))

  return (
    <Stage
      path={asset?.path ?? null}
      flip={flip}
      grey={grey}
      overlay={
        !float.on && (
          <div className="pointer-events-none absolute left-4 top-3 text-muted">
            {folder ? `${folder.name} · ` : ''}
            {entry.name}, {index + 1} of {count}
          </div>
        )
      }
    >
      <IconButton label="Previous (←)" onClick={() => step(-1)}>
        <ArrowLeft size={17} />
      </IconButton>
      <IconButton label="Next (→)" onClick={() => step(1)}>
        <ArrowRight size={17} />
      </IconButton>
      <IconButton label={favorite ? 'Remove from favorites' : 'Add to favorites'} active={favorite} onClick={toggleFavorite}>
        <Star size={17} filled={favorite} />
      </IconButton>
      <span className="mx-1 h-5 w-px bg-line" />
      <IconButton label="Flip (F)" active={flip} onClick={() => setFlip((v) => !v)}>
        <Flip size={17} />
      </IconButton>
      <IconButton label="Greyscale (G)" active={grey} onClick={() => setGrey((v) => !v)}>
        <Grey size={17} />
      </IconButton>
      <IconButton label={float.on ? 'Leave float mode' : 'Float on top'} active={float.on} onClick={() => setFloat({ on: !float.on })}>
        <Float size={17} />
      </IconButton>
      <span className="mx-1 h-5 w-px bg-line" />
      <IconButton label="Back to the folder (Esc)" onClick={close}>
        <Close size={17} />
      </IconButton>
    </Stage>
  )
}
