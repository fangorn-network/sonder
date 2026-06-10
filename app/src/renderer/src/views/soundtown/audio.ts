/**
 * soundtown/audio.ts — the SoundTown audio engine (v2: the world sings).
 *
 * There is NO synthesized bed any more.  The sound of the world IS the tracks:
 * each track-spirit emits its own 30s preview, and what you hear is a function of
 * how near you stand.  Walk toward a glow and its song resolves from muffled-and-
 * distant to clear-and-present.  Silence between spirits is intentional.
 *
 *   master ← compressor ← [ proximityBus(voice pool) , focusBus , sfxBus ]
 *
 * Voices are pooled MediaElement sources (robust + CORS-proven, no decode budget
 * to babysit).  Per voice:  <audio loop> → lowpass → panner → gain → proximityBus.
 * The nearest few spirits are mounted; farther mounted voices are stolen.  All
 * params ramp (setTargetAtTime) so it stays click-free.  "Focus" lifts one track
 * to full clarity for an encounter and ducks the ambient field.
 */

const VOICE_COUNT = 4
const AUDIBLE_R = 5.5      // tiles — beyond this a spirit is silent
const PREFETCH_R = 8.5     // tiles — preload within this so nothing pops
const LP_FAR = 460         // lowpass cutoff when distant (muffled)
const LP_NEAR = 7000       // cutoff up close (clear)

export interface SpiritAudio { id: string; tx: number; ty: number; url: string | null }

interface Voice {
    el: HTMLAudioElement
    src: MediaElementAudioSourceNode
    lp: BiquadFilterNode
    pan: StereoPannerNode
    gain: GainNode
    id: string | null
    ready: boolean
}

export class SoundTownAudio {
    private ctx: AudioContext | null = null
    private master!: GainNode
    private comp!: DynamicsCompressorNode
    private proxBus!: GainNode
    private focusBus!: GainNode
    private sfxBus!: GainNode
    private voices: Voice[] = []
    private focus!: Voice
    private noiseBuf: AudioBuffer | null = null

    muted = false
    volume = 0.85

    constructor() {
        try { this.volume = parseFloat(localStorage.getItem('sond3r:volume') ?? '0.85') } catch { /* */ }
        try { this.muted = localStorage.getItem('sond3r:muted') === '1' } catch { /* */ }
    }

    resume() { if (!this.ctx) this.init(); if (this.ctx!.state === 'suspended') this.ctx!.resume() }

    private init() {
        const ctx = new AudioContext(); this.ctx = ctx
        this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.volume
        this.comp = ctx.createDynamicsCompressor()
        this.comp.threshold.value = -16; this.comp.ratio.value = 3; this.comp.attack.value = 0.006; this.comp.release.value = 0.25
        this.comp.connect(this.master); this.master.connect(ctx.destination)
        this.proxBus = ctx.createGain(); this.proxBus.gain.value = 1; this.proxBus.connect(this.comp)
        this.focusBus = ctx.createGain(); this.focusBus.gain.value = 1; this.focusBus.connect(this.comp)
        this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.5; this.sfxBus.connect(this.comp)
        for (let i = 0; i < VOICE_COUNT; i++) this.voices.push(this.makeVoice(this.proxBus))
        this.focus = this.makeVoice(this.focusBus)
        const n = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate)
        const d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
        this.noiseBuf = n
    }

    private makeVoice(bus: GainNode): Voice {
        const ctx = this.ctx!
        const el = new Audio(); el.crossOrigin = 'anonymous'; el.loop = true; el.preload = 'auto'
        const src = ctx.createMediaElementSource(el)
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = LP_FAR; lp.Q.value = 0.7
        const pan = ctx.createStereoPanner()
        const gain = ctx.createGain(); gain.gain.value = 0
        src.connect(lp); lp.connect(pan); pan.connect(gain); gain.connect(bus)
        const v: Voice = { el, src, lp, pan, gain, id: null, ready: false }
        el.addEventListener('canplay', () => { v.ready = true })
        return v
    }

    private mount(v: Voice, s: SpiritAudio) {
        if (v.id === s.id) return
        v.id = s.id; v.ready = false
        if (s.url) { v.el.src = s.url; v.el.play().catch(() => { }) }
    }
    private unmount(v: Voice) {
        if (!v.id) return
        v.id = null; v.ready = false
        if (this.ctx) { v.gain.gain.cancelScheduledValues(this.ctx.currentTime); v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12) }
        try { v.el.pause() } catch { /* */ }
    }

    /**
     * Ambient mix: mount the nearest audible spirits to the voice pool and set
     * each voice's gain/lowpass/pan from the player's distance.  `kept` spirits
     * (already collected) stay silent.  Call ~8-12 Hz from the game loop.
     */
    updateProximity(playerTx: number, playerTy: number, spirits: SpiritAudio[], kept: Set<string>) {
        if (!this.ctx) return
        const now = this.ctx.currentTime
        const ranked = spirits
            .filter(s => s.url && !kept.has(s.id))
            .map(s => ({ s, d: Math.hypot(s.tx - playerTx, s.ty - playerTy) }))
            .filter(o => o.d < AUDIBLE_R)
            .sort((a, b) => a.d - b.d)
            .slice(0, VOICE_COUNT)
        const want = new Set(ranked.map(o => o.s.id))
        // free voices no longer wanted
        for (const v of this.voices) if (v.id && !want.has(v.id)) this.unmount(v)
        // assign each wanted spirit to a voice (reuse if already mounted, else a free one)
        for (const { s, d } of ranked) {
            let v = this.voices.find(x => x.id === s.id) ?? this.voices.find(x => !x.id)
            if (!v) continue
            this.mount(v, s)
            const k = Math.max(0, 1 - d / AUDIBLE_R)          // 0..1 nearness
            const g = k * k * 0.9
            v.gain.gain.setTargetAtTime(v.ready ? g : 0, now, 0.10)   // fade in only once buffered
            v.lp.frequency.setTargetAtTime(LP_FAR + k * k * (LP_NEAR - LP_FAR), now, 0.12)
            v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (s.tx - playerTx) / AUDIBLE_R)), now, 0.12)
        }
    }

    /** Encounter: lift one track to full clarity, hush the ambient field. */
    focusTrack(url: string | null) {
        if (!this.ctx || !url) return
        const now = this.ctx.currentTime
        this.proxBus.gain.setTargetAtTime(0.10, now, 0.08)
        const v = this.focus
        v.el.src = url; v.lp.frequency.setTargetAtTime(LP_NEAR, now, 0.05)
        v.pan.pan.setValueAtTime(0, now); v.gain.gain.cancelScheduledValues(now); v.gain.gain.setValueAtTime(0, now)
        v.el.play().then(() => v.gain.gain.setTargetAtTime(0.95, this.ctx!.currentTime, 0.08)).catch(() => { })
    }
    unfocus() {
        if (!this.ctx) return
        const now = this.ctx.currentTime
        this.focus.gain.gain.setTargetAtTime(0, now, 0.1)
        this.proxBus.gain.setTargetAtTime(1, now, 0.2)
        setTimeout(() => { try { this.focus.el.pause() } catch { /* */ } }, 200)
    }

    silenceAll() {
        for (const v of this.voices) this.unmount(v)
        this.unfocus()
    }

    // ── SFX (synthesized bursts — these are not the old drone) ────────────────
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
    footstep() { this.stepFlip = !this.stepFlip; this.noise(0.045, 'lowpass', 420, 0.07, this.stepFlip ? -0.2 : 0.2) }
    catch_() { this.blip(523, 784, 0.12, 'sine', 0.3); setTimeout(() => this.blip(784, 1175, 0.1, 'sine', 0.24), 90) }
    menu() { this.blip(330, 220, 0.05, 'square', 0.12) }
    /** A short character "voice" blip for typed dialogue — pitch varies by speaker. */
    voiceBlip(pitch = 1) { this.blip(180 * pitch, 150 * pitch, 0.03, 'square', 0.05) }
    warp() { this.blip(160, 720, 0.4, 'sine', 0.2) }

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
    dispose() { this.silenceAll(); try { this.ctx?.close() } catch { /* */ } this.ctx = null }
}
