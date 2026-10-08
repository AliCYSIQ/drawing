// Writes a few simple PNG "references" (a stick figure on a tinted background)
// so the end-to-end test has a folder of images without shipping photos.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

function crc32(buf: Buffer): number {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(w: number, h: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y)
      const o = y * (w * 3 + 1) + 1 + x * 3
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export function makeFixtures(dir: string, count = 6): string[] {
  mkdirSync(dir, { recursive: true })
  const files: string[] = []
  for (let i = 0; i < count; i++) {
    const w = 480
    const h = 640
    const lean = (i - count / 2) * 18
    const bones: [number, number, number, number][] = [
      [240, 170, 240 + lean, 360], // spine
      [240, 200, 160 - lean, 300], // arm
      [240, 200, 330, 250 + lean], // arm
      [240 + lean, 360, 180, 560], // leg
      [240 + lean, 360, 310 + lean, 560] // leg
    ]
    const tint = [
      [222, 214, 200],
      [205, 214, 224],
      [214, 222, 205],
      [224, 205, 210],
      [210, 205, 224],
      [220, 220, 210]
    ][i % 6]
    const file = join(dir, `pose-${String(i + 1).padStart(2, '0')}.png`)
    writeFileSync(
      file,
      png(w, h, (x, y) => {
        const head = Math.hypot(x - 240, y - 130) < 38
        const limb = bones.some(([ax, ay, bx, by]) => distToSegment(x, y, ax, ay, bx, by) < 9)
        if (head || limb) return [40, 42, 48]
        const shade = 1 - (y / h) * 0.12
        return [tint[0] * shade, tint[1] * shade, tint[2] * shade] as [number, number, number]
      })
    )
    files.push(file)
  }
  return files
}
