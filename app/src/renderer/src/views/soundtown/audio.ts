/**
 * soundtown/audio.ts — the SoundTown audio engine.
 *
 * One AudioContext, one bus graph.  We have no licensed stems — only 30s iTunes
 * previews — so "ambience" is SYNTHESIZED: a per-genre drone bed (a few detuned
 * oscillators + a slow filter sweep) tuned from the genre name.  The drone gives
 * each town a tonal identity and ducks under the encounter preview.  SFX
 * (footstep, rustle, catch, menu) are tiny synthesized bursts — zero assets.
 *
 *   master ← compressor ← [ ambienceBus, previewBus, sfxBus ] ← destination
 *
 * Everything ramps (never abrupt .value sets) so it stays click-free, and the
 * whole graph is a handful of nodes — cheap even on a software rasterizer box.
 */

const AMB_LEVEL = 0.055
const AMB_DUCKED = 0.012
const PREVIEW_LEVEL = 0.85

// Minor-leaning genres get a flat third; everything else a major third.
const MINOR_HINT = /techno|metal|drone|dark|industrial|doom|goth|noise|ambient|trap|phonk/

function freqFromGenre(g: string): { root: number; third: number; fifth: number } {
    let h = 0; for (let i = 0; i < g.length; i++) h = (h * 31 + g.charCodeAt(i)) >>> 0
    const root = 110 * Math.pow(2, ((h % 7)) / 12)          // A2..-ish, genre-stable
    const third = root * (MINOR_HINT.test(g.toLowerCase()) ? 1.1892 : 1.2599) // m3 vs M3
    const fifth = root * 1.4983
    return { root, third, fifth }
}

export class SoundTownAudio {
    private ctx: AudioContext | null = null
    private master!: GainNode
    private comp!: DynamicsCompressorNode
    private ambBus!: GainNode
    private prevBus!: GainNode
    private sfxBus!: GainNode
    private oscs: OscillatorNode[] = []
    private ambFilter!: BiquadFilterNode
    private lfo!: OscillatorNode
    private noiseBuf: AudioBuffer | null = null
    private prevEl: HTMLAudioElement | null = null
    private prevSrc: MediaElementAudioSourceNode | null = null

    muted = false
    volume = 0.8

    constructor() {
        try { this.volume = parseFloat(localStorage.getItem('sond3r:volume') ?? '0.8') } catch { /* */ }
        try { this.muted = localStorage.getItem('sond3r:muted') === '1' } catch { /* */ }
    }

    /** Must be called from a user gesture (key/click) to satisfy autoplay rules. */
    resume() {
        if (!this.ctx) this.init()
        if (this.ctx!.state === 'suspended') this.ctx!.resume()
    }

    private init() {
        const ctx = new AudioContext()
        this.ctx = ctx
        this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.volume
        this.comp = ctx.createDynamicsCompressor()
        this.comp.threshold.value = -18; this.comp.ratio.value = 3; this.comp.attack.value = 0.005; this.comp.release.value = 0.25
        this.comp.connect(this.master); this.master.connect(ctx.destination)

        this.ambBus = ctx.createGain(); this.ambBus.gain.value = AMB_LEVEL; this.ambBus.connect(this.comp)
        this.prevBus = ctx.createGain(); this.prevBus.gain.value = PREVIEW_LEVEL; this.prevBus.connect(this.comp)
        this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.5; this.sfxBus.connect(this.comp)

        // Drone bed: 3 oscillators through a slow-swept lowpass.
        this.ambFilter = ctx.createBiquadFilter(); this.ambFilter.type = 'lowpass'
        this.ambFilter.frequency.value = 600; this.ambFilter.Q.value = 4
        this.ambFilter.connect(this.ambBus)
        this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 0.07
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 220
        this.lfo.connect(lfoGain); lfoGain.connect(this.ambFilter.frequency); this.lfo.start()
        for (let i = 0; i < 3; i++) {
            const o = ctx.createOscillator(); o.type = i === 0 ? 'sine' : 'triangle'
            o.frequency.value = 110 * (1 + i * 0.5)
            const g = ctx.createGain(); g.gain.value = i === 0 ? 0.5 : 0.3
            o.connect(g); g.connect(this.ambFilter); o.start()
            this.oscs.push(o)
        }
        // Noise buffer for SFX.
        const n = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate)
        const d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
        this.noiseBuf = n
    }

    // ── Biome drone — retune the oscillators toward the new genre's chord ──────
    setBiome(genre: string) {
        if (!this.ctx) return
        const { root, third, fifth } = freqFromGenre(genre)
        const tune = [root, third, fifth]
        const now = this.ctx.currentTime
        this.oscs.forEach((o, i) => {
            o.frequency.cancelScheduledValues(now)
            o.frequency.setTargetAtTime(tune[i], now, 0.4)   // ~0.9s glide, click-free
        })
    }

    private duck(on: boolean) {
        if (!this.ctx) return
        const now = this.ctx.currentTime
        this.ambBus.gain.cancelScheduledValues(now)
        this.ambBus.gain.setTargetAtTime(on ? AMB_DUCKED : AMB_LEVEL, now, on ? 0.06 : 0.13)
    }

    // ── Encounter preview ─────────────────────────────────────────────────────
    async playPreview(url: string, onProgress?: (p: number) => void, onEnded?: () => void) {
        this.resume()
        this.stopPreview(false)
        const el = new Audio(); el.crossOrigin = 'anonymous'; el.src = url
        el.addEventListener('timeupdate', () => onProgress?.(el.currentTime / (el.duration || 30)))
        el.addEventListener('ended', () => { this.duck(false); onEnded?.() })
        try {
            const src = this.ctx!.createMediaElementSource(el)
            src.connect(this.prevBus); this.prevSrc = src
        } catch { /* element already wired */ }
        this.prevEl = el
        this.duck(true)
        el.play().catch(() => { })
    }

    stopPreview(unduck = true) {
        if (this.prevEl) { this.prevEl.pause(); this.prevEl = null }
        if (this.prevSrc) { try { this.prevSrc.disconnect() } catch { /* */ } this.prevSrc = null }
        if (unduck) this.duck(false)
    }

    // ── SFX (synthesized) ─────────────────────────────────────────────────────
    private noise(dur: number, type: BiquadFilterType, freq: number, gain: number, pan = 0) {
        if (!this.ctx || !this.noiseBuf) return
        const ctx = this.ctx, now = ctx.currentTime
        const src = ctx.createBufferSource(); src.buffer = this.noiseBuf
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq
        const g = ctx.createGain(); g.gain.setValueAtTime(gain, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
        const p = ctx.createStereoPanner(); p.pan.value = pan
        src.connect(f); f.connect(g); g.connect(p); p.connect(this.sfxBus); src.start(now); src.stop(now + dur)
    }
    private blip(f0: number, f1: number, dur: number, type: OscillatorType = 'sine', gain = 0.3) {
        if (!this.ctx) return
        const ctx = this.ctx, now = ctx.currentTime
        const o = ctx.createOscillator(); o.type = type
        o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(f1, now + dur)
        const g = ctx.createGain(); g.gain.setValueAtTime(gain, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
        o.connect(g); g.connect(this.sfxBus); o.start(now); o.stop(now + dur)
    }
    private stepFlip = false
    footstep() { this.stepFlip = !this.stepFlip; this.noise(0.05, 'lowpass', 480, 0.12, this.stepFlip ? -0.25 : 0.25) }
    rustle() { this.noise(0.12, 'bandpass', 2400, 0.18) }
    catch_() { this.blip(523, 784, 0.12, 'sine', 0.35); setTimeout(() => this.blip(784, 1175, 0.1, 'sine', 0.28), 90) }
    menu() { this.blip(330, 220, 0.06, 'square', 0.18) }
    warp() { this.blip(180, 720, 0.35, 'sine', 0.25) }

    // ── Mix controls ──────────────────────────────────────────────────────────
    setVolume(v: number) {
        this.volume = Math.max(0, Math.min(1, v))
        try { localStorage.setItem('sond3r:volume', String(this.volume)) } catch { /* */ }
        if (this.ctx && !this.muted) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05)
    }
    setMuted(m: boolean) {
        this.muted = m
        try { localStorage.setItem('sond3r:muted', m ? '1' : '0') } catch { /* */ }
        if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05)
    }
    dispose() { this.stopPreview(); try { this.ctx?.close() } catch { /* */ } this.ctx = null }
}
