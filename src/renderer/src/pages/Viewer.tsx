import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Close, Float, Flip, Grey, Star } from '../components/Icons'
import { Stage } from '../components/Stage'
import { IconButton } from '../components/ui'
import { useApp } from '../store'

/** Look at a board's images without a timer; works in float mode next to Clip Studio. */
export function Viewer({ boardId, index }: { boardId: string; index: number }) {
  const board = useApp((s) => s.boards.find((b) => b.id === boardId))
  const go = useApp((s) => s.go)
  const float = useApp((s) => s.float)
  const setFloat = useApp((s) => s.setFloat)
  const favoriteImages = useApp((s) => s.library.favoriteImages)
  const setLibrary = useApp((s) => s.setLibrary)
  const [flip, setFlip] = useState(false)
  const [grey, setGrey] = useState(false)

  const count = board?.images.length ?? 0
  const step = (d: number) => count && go({ name: 'viewer', boardId, index: (index + d + count) % count })
  const close = () => {
    if (float.on) setFloat({ on: false })
    go({ name: 'library', boardId })
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

  if (!board || !count) return null
  const img = board.images[Math.min(index, count - 1)]
  const favorite = favoriteImages.includes(img.id)
  const toggleFavorite = () =>
    setLibrary((l) => ({
      ...l,
      favoriteImages: favorite ? l.favoriteImages.filter((x) => x !== img.id) : [...l.favoriteImages, img.id]
    }))

  return (
    <Stage
      path={img.path}
      flip={flip}
      grey={grey}
      overlay={
        !float.on && (
          <div className="pointer-events-none absolute left-4 top-3 text-muted">
            {board.name}, {index + 1} of {count}
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
      <IconButton label="Back to the board (Esc)" onClick={close}>
        <Close size={17} />
      </IconButton>
    </Stage>
  )
}
