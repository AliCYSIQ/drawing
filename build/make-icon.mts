// Draws build/icon.png: a blue gesture stroke and a head on graphite.
// Run with: node build/make-icon.mts
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const S = 512

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

// The gesture line: a cubic curve sampled into points.
const curve: [number, number][] = []
for (let t = 0; t <= 1; t += 0.002) {
  const p0 = [120, 410], p1 = [190, 230], p2 = [300, 150], p3 = [400, 300]
  const u = 1 - t
  curve.push([
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
  ])
}

const raw = Buffer.alloc((S * 4 + 1) * S)
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0
  for (let x = 0; x < S; x++) {
    // Rounded square tile.
    const r = 110
    const dx = Math.max(0, Math.abs(x - S / 2) - (S / 2 - r))
    const dy = Math.max(0, Math.abs(y - S / 2) - (S / 2 - r))
    const inside = Math.hypot(dx, dy) <= r
    let rgba = inside ? [38, 40, 43, 255] : [0, 0, 0, 0]
    if (inside) {
      const ring = Math.abs(Math.hypot(x - 175, y - 150) - 46)
      if (ring < 11) rgba = [235, 232, 225, 255]
      let d = Infinity
      for (const [px, py] of curve) d = Math.min(d, Math.hypot(x - px, y - py))
      if (d < 22) rgba = [134, 182, 230, 255]
    }
    raw.set(rgba, y * (S * 4 + 1) + 1 + x * 4)
  }
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8
ihdr[9] = 6
writeFileSync(
  new URL('./icon.png', import.meta.url),
  Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
)
