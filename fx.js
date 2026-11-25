'use strict';
// Efectos de sonido sintetizados con Web Audio, al estilo de los juegos de
// artillería por turnos: disparo grave, silbido del proyectil, explosión,
// destellos de cartas y fanfarrias. No usa archivos de audio externos.
(() => {
  const STORAGE_KEY = 'reales-ideales-sound';
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  // Música y efectos se controlan por separado (panel de ajustes).
  let effectsOn = true;
  let musicOn = true;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'off') effectsOn = musicOn = false;
    else if (saved?.startsWith('{')) ({ effectsOn = true, musicOn = true } = JSON.parse(saved));
  } catch { /* sin almacenamiento */ }
  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ effectsOn, musicOn })); } catch { /* sin almacenamiento */ }
  };

  function audio() {
    if (!effectsOn && !musicOn) return null;
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
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  // === Música de fondo: Clan Quest en el menú y Clan Charge en la partida ===
  const TRACKS = {
    menu: { src: 'assets/audio/clan-quest.mp3', volume: 0.38 },
    battle: { src: 'assets/audio/clan-charge.mp3', volume: 0.26 },
  };
  const preloaded = new Map();
  let wanted = null;
  let current = null; // { name, el }
  let duckLevel = 1;
  function fade(el, to, ms, done) {
    const from = el.volume, start = performance.now();
    clearInterval(el._fade);
    el._fade = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / ms);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
      if (t >= 1) {
        clearInterval(el._fade);
        done?.();
      }
    }, 40);
  }
  function stopCurrent() {
    if (!current) return;
    const old = current.el;
    current = null;
    if (old.paused) clearInterval(old._fade);
    else fade(old, 0, 600, () => old.pause());
  }
  function applyMusic() {
    if (!musicOn || !wanted) {
      stopCurrent();
      return;
    }
    const track = TRACKS[wanted];
    if (current?.name === wanted) {
      if (current.el.paused) current.el.play().catch(() => {});
      fade(current.el, track.volume * duckLevel, 400);
      return;
    }
    stopCurrent();
    const el = preloaded.get(wanted) ?? new Audio(track.src);
    preloaded.delete(wanted);
    el.loop = true;
    el.volume = 0;
    el.preload = 'auto';
    current = { name: wanted, el };
    // Sin un gesto previo el navegador rechaza play(); se reintenta en el primer toque.
    el.play().then(() => {
      if (current?.el === el && musicOn) fade(el, track.volume * duckLevel, 900);
    }).catch(() => {});
  }
  // Reutiliza el mismo elemento al cambiar de pista, evitando volver a descargarlo.
  function preloadMusic(name) {
    if (current?.name === name) return current.el;
    if (!TRACKS[name]) return null;
    if (!preloaded.has(name)) {
      const el = new Audio(TRACKS[name].src);
      el.preload = 'auto';
      preloaded.set(name, el);
      el.load();
    }
    return preloaded.get(name);
  }
  function music(name) {
    wanted = name;
    duckLevel = 1;
    applyMusic();
  }
  function duck(level) {
    duckLevel = level;
    if (current && musicOn) fade(current.el, TRACKS[current.name].volume * level, 500);
  }

  // Los navegadores exigen un gesto del usuario para habilitar el audio.
  const unlock = event => {
    if (!event.isTrusted || (!effectsOn && !musicOn)) return;
    if (effectsOn) audio();
    if (wanted && (!current || current.el.paused)) applyMusic();
  };
  for (const event of ['pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(event, unlock, { capture: true, passive: true });
  }

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
    // Motor de camioncito: traqueteo grave modulado mientras avanza.
    drive(duration = 0.9) {
      const a = audio();
      if (!a) return;
      const t = a.currentTime;
      const osc = a.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(55, t);
      osc.frequency.linearRampToValueAtTime(75, t + duration * 0.4);
      osc.frequency.linearRampToValueAtTime(50, t + duration);
      const filter = a.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const gain = a.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.08);
      gain.gain.setValueAtTime(0.22, t + duration - 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      // Pulso de pistones: modula el volumen unas 14 veces por segundo.
      const lfo = a.createOscillator();
      const depth = a.createGain();
      lfo.frequency.value = 14;
      depth.gain.value = 0.12;
      lfo.connect(depth).connect(gain.gain);
      osc.connect(filter).connect(gain).connect(master);
      osc.start(t); lfo.start(t);
      osc.stop(t + duration + 0.05); lfo.stop(t + duration + 0.05);
      [0.15, 0.45, 0.72].forEach(at => noise(at * duration, 0.09, { peak: 0.12, filter: 'bandpass', from: 700, to: 300, q: 1.5 }));
    },
    // Respuesta corta y alegre al llegar.
    ok() { notes('square', [784, 1175], 0.08, 0, 0.1, 0.07); notes('sine', [784, 1175], 0.08, 0, 0.14, 0.16); },
    // Grito de ataque: corneta ascendente antes del disparo.
    charge() {
      notes('sawtooth', [392, 523, 659], 0.09, 0, 0.14, 0.07);
      tone('triangle', 784, 988, 0.27, 0.3, 0.2);
    },
    // Ataque especial: carga de energía ascendente y estallido.
    special() {
      tone('sawtooth', 110, 880, 0, 0.7, 0.1, 0.05);
      tone('square', 220, 1760, 0.05, 0.65, 0.05, 0.05);
      noise(0, 0.7, { peak: 0.18, filter: 'bandpass', from: 400, to: 4000, q: 2, attack: 0.3 });
      notes('triangle', [523, 784, 1047, 1568], 0.06, 0.7, 0.3, 0.2);
      tone('sine', 80, 40, 0.7, 0.4, 0.7);
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
    // Tic del temporizador en los últimos segundos.
    tick() { tone('square', 1320, 1320, 0, 0.05, 0.06); tone('sine', 660, 660, 0, 0.06, 0.12); },
    // Derrota: notas que caen y un golpe sordo.
    defeat() {
      notes('triangle', [392, 349, 311, 262], 0.22, 0, 0.32, 0.2);
      tone('sawtooth', 130, 65, 0.9, 0.8, 0.12);
      tone('sine', 70, 35, 0.9, 0.9, 0.5);
    },
    victory() {
      notes('square', [523, 523, 523, 698], 0.15, 0, 0.18, 0.08);
      notes('triangle', [523, 659, 784, 1047], 0.15, 0, 0.35, 0.2);
      tone('triangle', 1047, 1047, 0.65, 0.9, 0.24);
    },
  };

  function play(name, ...args) {
    if (!effectsOn || !sounds[name]) return;
    try { sounds[name](...args); } catch { /* audio no disponible */ }
  }
  function setMuted(value) {
    effectsOn = musicOn = !value;
    save();
    if (effectsOn) play('move');
    applyMusic();
  }
  function setEffects(on) {
    effectsOn = Boolean(on);
    save();
    if (effectsOn) play('move');
  }
  function setMusic(on) {
    musicOn = Boolean(on);
    save();
    applyMusic();
  }
  window.RealesIdealesFX = { play, setMuted, isMuted: () => !effectsOn && !musicOn, music, preloadMusic, duck,
    setEffects, setMusic, effectsOn: () => effectsOn, musicOn: () => musicOn };
})();
