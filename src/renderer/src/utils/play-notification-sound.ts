/** Short success chime after wizard config save (user gesture allows audio on most platforms). */
export function playConfigSavedChime(): void {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.value = 0.07
    const freqs = [523.25, 659.25]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      const t0 = ctx.currentTime + i * 0.11
      osc.start(t0)
      osc.stop(t0 + 0.18)
    })
    window.setTimeout(() => void ctx.close(), 900)
  } catch {
    /* ignore — autoplay policy / missing API */
  }
}
