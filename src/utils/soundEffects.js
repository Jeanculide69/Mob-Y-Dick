// Sound effects generator - plays sounds using Web Audio API
// No external files needed, works everywhere, no CORS issues

const getAudioCtx = () => new (window.AudioContext || window.webkitAudioContext)()

const soundGenerators = {
  // Fart / poop sound - low frequency rumble
  poop: (ctx) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(80, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.4)
    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
    osc.connect(gain).connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 0.5)
  },

  // Fart - wet splat
  fart: (ctx) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(120, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.6)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6)
    osc.connect(gain).connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 0.7)
  },

  // Horn - classic car horn
  horn: (ctx) => {
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()
    osc1.type = 'square'; osc1.frequency.value = 480
    osc2.type = 'square'; osc2.frequency.value = 380
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.setValueAtTime(0.25, ctx.currentTime + 0.8)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.0)
    osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination)
    osc1.start(); osc2.start()
    osc1.stop(ctx.currentTime + 1.0); osc2.stop(ctx.currentTime + 1.0)
  },

  // Clown buzzer - fail sound
  clown: (ctx) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(200, ctx.currentTime)
    osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.8)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8)
    osc.connect(gain).connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 0.9)
  },

  // Fire crackling
  fire: (ctx) => {
    const bufferSize = ctx.sampleRate * 1.5
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.5)) * 0.5
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'; filter.frequency.value = 800; filter.Q.value = 0.5
    source.connect(filter).connect(ctx.destination)
    source.start()
  },

  // Engine revving (motocross)
  engine: (ctx) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(60, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.8)
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 1.2)
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.setValueAtTime(0.3, ctx.currentTime + 0.5)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5)
    osc.connect(gain).connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 1.5)
  },

  // Crash / explosion
  crash: (ctx) => {
    const bufferSize = ctx.sampleRate * 1
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.15))
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.6, ctx.currentTime)
    source.connect(gain).connect(ctx.destination)
    source.start()
  },

  // Trophy / victory fanfare
  trophy: (ctx) => {
    const notes = [523, 659, 784, 1047] // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.15)
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + i * 0.15 + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.5)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.15)
      osc.stop(ctx.currentTime + i * 0.15 + 0.5)
    })
  },

  // Airhorn
  airhorn: (ctx) => {
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()
    osc1.type = 'sawtooth'; osc1.frequency.value = 650
    osc2.type = 'sawtooth'; osc2.frequency.value = 550
    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.setValueAtTime(0.4, ctx.currentTime + 1.2)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5)
    osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination)
    osc1.start(); osc2.start()
    osc1.stop(ctx.currentTime + 1.5); osc2.stop(ctx.currentTime + 1.5)
  },

  // Splash (rooster tail)
  splash: (ctx) => {
    const bufferSize = ctx.sampleRate * 0.8
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.2)) * 0.5
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'; filter.frequency.value = 2000
    source.connect(filter).connect(ctx.destination)
    source.start()
  },

  // Laugh
  laugh: (ctx) => {
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(350 + (i % 2) * 150, ctx.currentTime + i * 0.12)
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12)
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.12 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.12 + 0.1)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.12)
      osc.stop(ctx.currentTime + i * 0.12 + 0.12)
    }
  },

  // Mind blown - ascending whistle then explosion
  mindblown: (ctx) => {
    // Ascending whistle
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(200, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.6)
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.6)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7)
    osc.connect(gain).connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + 0.7)
    // Then noise burst (explosion)
    const startTime = ctx.currentTime + 0.6
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.1))
    const s = ctx.createBufferSource(); s.buffer = buf
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, startTime)
    s.connect(g).connect(ctx.destination)
    s.start(startTime)
  },

  // Cash register (for donations)
  cashregister: (ctx) => {
    const notes = [1200, 1400, 1600]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.08)
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.08 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.08 + 0.15)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.08)
      osc.stop(ctx.currentTime + i * 0.08 + 0.2)
    })
  },
}

// Map slug -> sound function name
const slugToSound = {
  emote_poop: 'poop',
  emote_fart: 'fart',
  sound_horn: 'horn',
  emote_clown: 'clown',
  emote_fire: 'fire',
  emote_wheelie: 'engine',
  emote_crash: 'crash',
  emote_trophy: 'trophy',
  sound_airhorn: 'airhorn',
  emote_rooster: 'splash',
  emote_laughcry: 'laugh',
  emote_mindblown: 'mindblown',
}

// ── Master gain ──
// Tous les générateurs `connect(ctx.destination)` directement. Pour
// baisser globalement le volume sans toucher aux 14 générateurs, on
// passe au générateur un Proxy du ctx qui retourne un GainNode à la
// place de `destination`. Le GainNode est branché sur le vrai
// destination avec un volume réduit.
const MASTER_GAIN = 0.3  // 30% du volume nominal des générateurs

const playWithMasterGain = (ctx, runGenerator) => {
  const master = ctx.createGain()
  master.gain.value = MASTER_GAIN
  master.connect(ctx.destination)
  const proxyCtx = new Proxy(ctx, {
    get(target, prop) {
      if (prop === 'destination') return master
      const v = target[prop]
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
  runGenerator(proxyCtx)
}

export function playPremiumSound(slug) {
  try {
    const ctx = getAudioCtx()
    const soundName = slugToSound[slug]
    if (soundName && soundGenerators[soundName]) {
      playWithMasterGain(ctx, (proxy) => soundGenerators[soundName](proxy))
    }
  } catch (e) {
    console.log('Sound playback error:', e)
  }
}

export function playDonationSound() {
  try {
    const ctx = getAudioCtx()
    playWithMasterGain(ctx, (proxy) => soundGenerators.cashregister(proxy))
  } catch (e) {
    console.log('Donation sound error:', e)
  }
}
