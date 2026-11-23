'use strict';
// Efectos de sonido sintetizados con Web Audio, al estilo de los juegos de
// artillería por turnos: disparo grave, silbido del proyectil, explosión,
// destellos de cartas y fanfarrias. No usa archivos de audio externos.
(() => {
  const STORAGE_KEY = 'reales-ideales-sound';
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;
  try { muted = localStorage.getItem(STORAGE_KEY) === 'off'; } catch { /* sin almacenamiento */ }

  function audio() {
    if (muted) return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) {
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.55;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 8;
      master.connect(limiter).connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // Los navegadores exigen un gesto del usuario para habilitar el audio.
  const unlock = () => { if (!muted) audio(); };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  function envelope(gain, t, attack, peak, decay) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function tone(type, from, to, start, duration, peak = 0.4, attack = 0.01) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + start;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    envelope(gain, t, attack, peak, duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + attack + duration + 0.05);
  }
  function noise(start, duration, { peak = 0.5, filter = 'lowpass', from = 2000, to = 200, q = 0.8, attack = 0.005 } = {}) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + start;
    const src = a.createBufferSource();
    src.buffer = noiseBuffer;
    const biquad = a.createBiquadFilter();
    biquad.type = filter;
    biquad.Q.value = q;
    biquad.frequency.setValueAtTime(from, t);
    biquad.frequency.exponentialRampToValueAtTime(to, t + duration);
    const gain = a.createGain();
    envelope(gain, t, attack, peak, duration);
    src.connect(biquad).connect(gain).connect(master);
    src.start(t);
    src.stop(t + attack + duration + 0.05);
  }
  function notes(type, list, step, start = 0, length = 0.18, peak = 0.22) {
    list.forEach((freq, i) => tone(type, freq, freq, start + i * step, length, peak));
  }

  const sounds = {
    // Disparo de cañón: golpe grave, chasquido y silbido del proyectil.
    launch() {
      tone('sine', 150, 38, 0, 0.35, 0.9);
      noise(0, 0.22, { peak: 0.7, from: 3500, to: 300 });
      tone('square', 90, 50, 0, 0.12, 0.18);
      tone('sine', 1700, 520, 0.12, 0.75, 0.12, 0.05);
    },
    // Explosión: ruido filtrado que se apaga y un retumbe grave.
    explosion(big = false) {
      noise(0, big ? 1.1 : 0.75, { peak: 0.95, from: 2600, to: 80 });
      noise(0, 0.12, { peak: 0.5, filter: 'highpass', from: 3000, to: 1200 });
      tone('sine', 95, 28, 0, big ? 0.9 : 0.6, 1);
      tone('triangle', 60, 30, 0.05, 0.5, 0.45);
      if (big) noise(0.18, 0.7, { peak: 0.45, from: 900, to: 60 });
    },
    // Ambos caen: dos explosiones encadenadas.
    draw() { sounds.explosion(); setTimeout(() => sounds.explosion(), 170); },
    move() {
      tone('triangle', 330, 520, 0, 0.09, 0.22);
      noise(0, 0.12, { peak: 0.15, filter: 'bandpass', from: 900, to: 400, q: 2 });
    },
    turn(side) {
      const base = side === 'R' ? 220 : 262;
      notes('sawtooth', [base, base * 1.5], 0.14, 0, 0.22, 0.09);
      notes('triangle', [base * 2, base * 3], 0.14, 0, 0.22, 0.12);
    },
    pass() { tone('sine', 220, 140, 0, 0.18, 0.18); },
    boost() { notes('triangle', [523, 659, 784, 1047], 0.06, 0, 0.18, 0.2); },
    weaken() {
      notes('sawtooth', [494, 415, 349, 262], 0.07, 0, 0.2, 0.08);
      tone('sine', 300, 120, 0, 0.35, 0.2);
    },
    major() {
      notes('triangle', [392, 523, 659, 784, 1047, 1319], 0.05, 0, 0.22, 0.2);
      tone('sine', 110, 220, 0, 0.4, 0.3, 0.05);
    },
    // Golpe decisivo: barrido de espada y campana metálica.
    decisive() {
      noise(0, 0.25, { peak: 0.55, filter: 'bandpass', from: 600, to: 5000, q: 1.5, attack: 0.04 });
      tone('square', 1568, 1568, 0.16, 0.45, 0.07);
      tone('sine', 2093, 2093, 0.16, 0.6, 0.18);
      tone('sine', 98, 40, 0.16, 0.3, 0.6);
    },
    // Invocación del cañón: carga creciente y cierre de hierro.
    cannon() {
      tone('sawtooth', 80, 640, 0, 0.6, 0.12, 0.05);
      tone('sine', 160, 1280, 0, 0.6, 0.12, 0.05);
      noise(0.62, 0.15, { peak: 0.5, filter: 'bandpass', from: 1800, to: 700, q: 3 });
      tone('square', 110, 70, 0.62, 0.15, 0.2);
    },
    search() {
      notes('sine', [880, 1175, 1568, 1319, 1760], 0.07, 0, 0.25, 0.14);
      noise(0, 0.4, { peak: 0.08, filter: 'highpass', from: 6000, to: 9000 });
    },
    combo() {
      notes('sawtooth', [262, 330, 392], 0, 0, 0.5, 0.07);
      notes('triangle', [523, 659, 784, 1047, 1319, 1568], 0.055, 0.05, 0.25, 0.2);
      noise(0, 0.6, { peak: 0.12, filter: 'highpass', from: 4000, to: 8000 });
    },
    summon() { sounds.cannon(); notes('triangle', [392, 523, 784], 0.1, 0.75, 0.3, 0.18); },
    rescue() { notes('sine', [523, 659, 784, 1047, 1319], 0.08, 0, 0.35, 0.2); },
    deal() { [0, 0.07, 0.14].forEach(t => noise(t, 0.06, { peak: 0.22, filter: 'bandpass', from: 2500, to: 1500, q: 1.2 })); },
    victory() {
      notes('square', [523, 523, 523, 698], 0.15, 0, 0.18, 0.08);
      notes('triangle', [523, 659, 784, 1047], 0.15, 0, 0.35, 0.2);
      tone('triangle', 1047, 1047, 0.65, 0.9, 0.24);
    },
  };

  function play(name, ...args) {
    if (muted || !sounds[name]) return;
    try { sounds[name](...args); } catch { /* audio no disponible */ }
  }
  function setMuted(value) {
    muted = Boolean(value);
    try { localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on'); } catch { /* sin almacenamiento */ }
    if (!muted) play('move');
  }
  window.RealesIdealesFX = { play, setMuted, isMuted: () => muted };
})();
