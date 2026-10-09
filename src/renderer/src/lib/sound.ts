// Short synthesized tones, so no audio files are needed.

let ctx: AudioContext | null = null

function tone(freq: number, start: number, duration: number, gain = 0.12): void {
  ctx ??= new AudioContext()
  const t = ctx.currentTime + start
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.connect(g).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + duration + 0.05)
}

/** End of a pose: one soft bell. End of the session: a rising pair. */
export function chime(kind: 'pose' | 'done' | 'rest' | 'tick'): void {
  try {
    if (kind === 'tick') tone(1200, 0, 0.06, 0.05)
    else if (kind === 'pose') tone(880, 0, 0.5)
    else if (kind === 'rest') tone(660, 0, 0.35, 0.08)
    else {
      tone(660, 0, 0.4)
      tone(990, 0.18, 0.6)
    }
  } catch {
    // Audio can fail without a device; the timer still works.
  }
}
