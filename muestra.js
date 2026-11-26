'use strict';
// Combate de muestra de Reales Ideales: prueba de calidad visual y sonora con PixiJS.
// Usa el escenario Campo andino, las fichas de plastilina y las casillas medidas en
// perspectiva. No modifica el juego: es una escena aislada para validar el acabado.
(() => {
  const PIXI = window.PIXI;
  const rules = window.RealesIdeales;
  const scene = window.RealesIdealesEscenarios.andes;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = scene.width, H = scene.height, SKY_CROP = 200;
  const byId = id => document.getElementById(id);

  // ---------- Geometría de casillas (mismo sistema que el juego) ----------
  const cells = {};
  for (const [id, c] of Object.entries(scene.cells)) {
    const xs = c.poly.map(p => p[0]), ys = c.poly.map(p => p[1]);
    cells[id] = { x: c.x, y: c.y, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  const TOKEN_SCALE = .66;
  const foot = id => ({ x: cells[id].x, y: cells[id].y + cells[id].h * .2 });
  const tokenSize = id => cells[id].w * TOKEN_SCALE;

  // ---------- Tiempo: escala global (pausa de impacto y cámara lenta) ----------
  const clock = { scale: 1, now: 0 };
  const tweens = new Set();
  const timers = new Set();
  const ease = {
    linear: t => t,
    outCubic: t => 1 - (1 - t) ** 3,
    inCubic: t => t * t * t,
    inOutCubic: t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
    outBack: t => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
    outElastic: t => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI) / 3) + 1),
  };
  const getPath = (o, p) => p.split('.').reduce((a, k) => a[k], o);
  const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
  function tween(target, to, ms, easing = ease.outCubic) {
    return new Promise(resolve => {
      const from = Object.fromEntries(Object.keys(to).map(k => [k, getPath(target, k)]));
      tweens.add({ target, from, to, ms: Math.max(1, ms), t: 0, easing, resolve });
    });
  }
  function wait(ms) {
    return new Promise(resolve => timers.add({ at: clock.now + ms, resolve }));
  }
  // Pausa de impacto: congela el tiempo del juego unos milisegundos reales.
  function hitStop(ms) {
    if (reduced) return Promise.resolve();
    const prev = clock.scale;
    clock.scale = 0;
    return new Promise(r => setTimeout(() => { clock.scale = prev || 1; r(); }, ms));
  }

  // ---------- Sonido sintetizado con reverberación ----------
  const audio = (() => {
    let ctx = null, master = null, wet = null, noiseBuf = null, on = true;
    try { on = localStorage.getItem('reales-ideales-muestra-sonido') !== 'off'; } catch { /* sin almacenamiento */ }
    const music = new Audio('assets/audio/clan-charge.mp3');
    music.loop = true; music.volume = 0;
    function init() {
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      master = ctx.createGain(); master.gain.value = .8;
      master.connect(comp).connect(ctx.destination);
      // Reverberación corta generada (sala de piedra), da profundidad a impactos y voces.
      const conv = ctx.createConvolver();
      const len = ctx.sampleRate * 1.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
      }
      conv.buffer = ir;
      wet = ctx.createGain(); wet.gain.value = .28;
      wet.connect(conv).connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      return ctx;
    }
    function out(node, reverb = true) {
      node.connect(master);
      if (reverb) node.connect(wet);
    }
    function env(g, t, a, peak, d) {
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(.0001, t + a + d);
    }
    function tone(type, f0, f1, at, dur, peak = .3, a = .005, reverb = true) {
      if (!on || !init()) return;
      const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      env(g, t, a, peak, dur); o.connect(g); out(g, reverb);
      o.start(t); o.stop(t + a + dur + .05);
    }
    function noise(at, dur, { peak = .4, type = 'lowpass', f0 = 3000, f1 = 200, q = .8, a = .005, rate = 1, reverb = true } = {}) {
      if (!on || !init()) return;
      const t = ctx.currentTime + at, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.playbackRate.value = rate;
      f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      env(g, t, a, peak, dur); s.connect(f).connect(g); out(g, reverb);
      s.start(t, Math.random()); s.stop(t + a + dur + .05);
    }
    const sfx = {
      whoosh(d = .28) { noise(0, d, { peak: .32, type: 'bandpass', f0: 400, f1: 2600, q: 1.4, a: d * .6 }); },
      hop() { tone('sine', 240, 520, 0, .1, .16); noise(0, .08, { peak: .08, type: 'highpass', f0: 2000, f1: 4000 }); },
      land() { tone('sine', 120, 50, 0, .18, .5, .003); noise(0, .14, { peak: .3, f0: 900, f1: 120 }); },
      // Impacto en capas: chasquido, cuerpo de ruido y golpe grave.
      impact(power = 1) {
        noise(0, .04, { peak: .5, type: 'highpass', f0: 5000, f1: 2500, reverb: false });
        noise(0, .35 + power * .3, { peak: .55 + power * .3, f0: 2400, f1: 80 });
        tone('sine', 110, 32, 0, .3 + power * .35, .9, .002);
        tone('triangle', 70, 35, .02, .25 + power * .2, .4 * power);
      },
      explosion() {
        sfx.impact(1.3);
        noise(.05, 1.4, { peak: .7, f0: 1400, f1: 50, rate: .6 });
        noise(.15, 1.1, { peak: .25, type: 'bandpass', f0: 300, f1: 90, q: .9, rate: .5 });
      },
      fireIgnite() { noise(0, .6, { peak: .45, type: 'bandpass', f0: 300, f1: 2400, q: 1.1, a: .18 }); tone('sawtooth', 90, 240, 0, .6, .07, .1); },
      fireRoar(d = 1.3) {
        if (!on || !init()) return;
        const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        s.buffer = noiseBuf; s.loop = true; f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1800, t + d);
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.35, t + .3); g.gain.setValueAtTime(.35, t + d - .1); g.gain.exponentialRampToValueAtTime(.0001, t + d);
        lfo.frequency.value = 11; lg.gain.value = .12; lfo.connect(lg).connect(g.gain);
        s.connect(f).connect(g); out(g); s.start(t); lfo.start(t); s.stop(t + d + .05); lfo.stop(t + d + .05);
        for (let i = 0; i < 14; i++) noise(Math.random() * d, .03, { peak: .12, type: 'highpass', f0: 3000, f1: 6000, reverb: false });
      },
      segment(i) { tone('triangle', [660, 880, 1175][i], [660, 880, 1175][i], 0, .25, .22); tone('sine', [1320, 1760, 2350][i], [1320, 1760, 2350][i], 0, .3, .08); },
      title() { tone('sine', 70, 40, 0, .9, .8, .004); noise(0, .9, { peak: .35, f0: 900, f1: 60 }); tone('square', 220, 110, 0, .35, .06); },
      card() { noise(0, .18, { peak: .22, type: 'bandpass', f0: 1500, f1: 4200, q: 1.6, a: .08 }); tone('triangle', 880, 1320, .12, .12, .12); },
      buff() { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, i * .05, .2, .16)); },
      debuff() { [494, 392, 311].forEach((f, i) => tone('sawtooth', f, f * .9, i * .06, .2, .06)); tone('sine', 220, 110, 0, .35, .2); },
      ko() { tone('square', 700, 140, 0, .45, .07); tone('sine', 900, 180, 0, .5, .16); noise(.05, .3, { peak: .2, type: 'bandpass', f0: 2000, f1: 600, q: 2 }); },
      coin(i = 0) { tone('square', 1568 + i * 90, 1568 + i * 90, 0, .06, .05, .002, false); tone('sine', 2093 + i * 120, 2093 + i * 120, .05, .18, .12); },
      poof() { noise(0, .35, { peak: .25, type: 'bandpass', f0: 600, f1: 1800, q: .8, a: .05 }); },
      slowIn() { noise(0, 1.2, { peak: .3, type: 'bandpass', f0: 3000, f1: 200, q: 1.2, a: .9, rate: .35 }); tone('sine', 300, 60, 0, 1.2, .25, .8); },
      shatter() { sfx.impact(1.6); for (let i = 0; i < 10; i++) tone('triangle', 900 + Math.random() * 1400, 500, .04 + i * .03, .12, .06); },
      cheer() { for (let i = 0; i < 6; i++) noise(i * .07, .5, { peak: .07, type: 'bandpass', f0: 700 + i * 120, f1: 1100, q: 3, a: .1 }); },
      victory() { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, i * .12, .3, .18)); tone('triangle', 1047, 1047, .5, .8, .2); },
    };
    function setOn(v) {
      on = v;
      try { localStorage.setItem('reales-ideales-muestra-sonido', on ? 'on' : 'off'); } catch { /* sin almacenamiento */ }
      if (on) { init(); ctx?.resume(); music.play().catch(() => {}); fadeMusic(.22); } else { fadeMusic(0, () => music.pause()); }
    }
    let musicTimer = null;
    function fadeMusic(to, done) {
      clearInterval(musicTimer);
      const from = music.volume, start = performance.now();
      musicTimer = setInterval(() => {
        const t = Math.min(1, (performance.now() - start) / 500);
        music.volume = from + (to - from) * t;
        if (t >= 1) { clearInterval(musicTimer); done?.(); }
      }, 30);
    }
    return { sfx, setOn, isOn: () => on, unlock() { if (on) { init(); ctx?.resume(); music.play().catch(() => {}); fadeMusic(.22); } },
      duck(v) { if (on) fadeMusic(v); } };
  })();

  // ---------- Escena PixiJS ----------
  const app = new PIXI.Application();
  let world, layers, cam, particles, screenFx, textures, tokens = {}, video;
  const imageTextures = {};

  function canvasTexture(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return PIXI.Texture.from(c);
  }
  function makeTextures() {
    const radial = (stops) => canvasTexture(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    return {
      glow: radial([[0, 'rgba(255,255,255,1)'], [.35, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]),
      soft: radial([[0, 'rgba(255,255,255,.9)'], [.6, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]),
      shadow: radial([[0, 'rgba(20,10,5,.75)'], [.55, 'rgba(20,10,5,.4)'], [1, 'rgba(20,10,5,0)']]),
      vignette: radial([[0, 'rgba(10,5,3,0)'], [.55, 'rgba(10,5,3,0)'], [.8, 'rgba(10,5,3,.55)'], [1, 'rgba(10,5,3,.95)']]),
      spark: canvasTexture(64, 16, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.7, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2, h / 4, 0, 0, Math.PI * 2); g.fill();
      }),
      chunk: canvasTexture(32, 32, (g) => {
        g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(4, 10); g.lineTo(16, 3); g.lineTo(29, 9); g.lineTo(26, 26); g.lineTo(9, 29); g.closePath(); g.fill();
        g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.moveTo(9, 29); g.lineTo(26, 26); g.lineTo(29, 9); g.lineTo(22, 20); g.closePath(); g.fill();
      }),
      ring: canvasTexture(256, 256, (g, w) => { g.strokeStyle = '#fff'; g.lineWidth = 14; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 12, 0, Math.PI * 2); g.stroke(); }),
      star: canvasTexture(64, 64, (g) => {
        g.fillStyle = '#fff'; g.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 30, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
        g.closePath(); g.fill();
      }),
      rune: canvasTexture(256, 256, (g, w) => {
        g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(w / 2, w / 2, 110, 0, Math.PI * 2); g.stroke();
        g.lineWidth = 3; g.beginPath(); g.arc(w / 2, w / 2, 86, 0, Math.PI * 2); g.stroke();
        for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 86, w / 2 + Math.sin(a) * 86); g.lineTo(w / 2 + Math.cos(a + .26) * 110, w / 2 + Math.sin(a + .26) * 110); g.stroke(); }
      }),
    };
  }

  // ---------- Partículas ----------
  function createParticles(container, cap = reduced ? 160 : 700) {
    const list = [];
    function spawn(o) {
      if (list.length >= cap) return null;
      const s = new PIXI.Sprite(o.tex || textures.glow);
      s.anchor.set(.5); s.x = o.x; s.y = o.y; s.tint = o.tint ?? 0xffffff;
      s.blendMode = o.add ? 'add' : 'normal'; s.rotation = o.rot ?? 0;
      container.addChild(s);
      const p = { s, vx: o.vx || 0, vy: o.vy || 0, g: o.g || 0, drag: o.drag ?? 1, life: o.life || 600, t: 0,
        s0: o.s0 ?? 1, s1: o.s1 ?? 0, sy: o.sy ?? 1, a0: o.a0 ?? 1, a1: o.a1 ?? 0, vr: o.vr || 0, align: o.align, delay: o.delay || 0 };
      s.alpha = p.delay ? 0 : p.a0; s.scale.set(p.s0, p.s0 * p.sy);
      list.push(p); return p;
    }
    function update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        if (p.delay > 0) { p.delay -= dt; continue; }
        p.t += dt;
        const k = Math.min(1, p.t / p.life), f = dt / 1000;
        p.vx *= p.drag ** (dt / 16.7); p.vy *= p.drag ** (dt / 16.7); p.vy += p.g * f;
        p.s.x += p.vx * f; p.s.y += p.vy * f; p.s.rotation += p.vr * f;
        if (p.align) p.s.rotation = Math.atan2(p.vy, p.vx);
        const sc = p.s0 + (p.s1 - p.s0) * ease.outCubic(k);
        p.s.scale.set(sc, sc * p.sy);
        p.s.alpha = p.a0 + (p.a1 - p.a0) * k;
        if (k >= 1) { p.s.destroy(); list.splice(i, 1); }
      }
    }
    return { spawn, update, count: () => list.length };
  }
  const rand = (a, b) => a + Math.random() * (b - a);
  const FIRE = [0xfff3a0, 0xffd34d, 0xffa02e, 0xff6a1a, 0xe8431c];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const TEAM = { I: [0x4a8fc4, 0x2f6a99, 0xe9d7b5], R: [0xd2553f, 0xa83a2c, 0xe9d7b5] };

  function dust(x, y, n = 12, spread = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * .95, Math.PI * 2.05);
      particles.ground.spawn({ tex: textures.soft, x: x + rand(-10, 10), y: y + rand(-4, 4), vx: Math.cos(a) * rand(60, 200) * spread, vy: Math.sin(a) * rand(15, 60),
        drag: .9, life: rand(450, 800), s0: rand(.25, .4), s1: rand(.7, 1.1), sy: .6, a0: .6, a1: 0, tint: pick([0xe3cfa4, 0xd4b88a, 0xc9a873]) });
    }
  }
  function sparks(x, y, n = 26, speed = 900, colors = [0xffffff, 0xfff3a0, 0xffd34d]) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), v = rand(speed * .4, speed);
      particles.fx.spawn({ tex: textures.spark, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, g: 900, drag: .92, life: rand(260, 520),
        s0: rand(.5, .9), s1: .1, sy: .7, a0: 1, a1: 0, tint: pick(colors), add: true, align: true });
    }
  }
  function chunks(x, y, side, n = 14, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * .95, -Math.PI * .05), v = rand(220, 620) * power;
      particles.fx.spawn({ tex: textures.chunk, x: x + rand(-14, 14), y: y + rand(-24, 6), vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1700, drag: .985,
        life: rand(650, 1100), s0: rand(.35, .7), s1: rand(.3, .6), a0: 1, a1: .0, vr: rand(-12, 12), tint: pick(TEAM[side]) });
    }
  }
  function shockwave(x, y, scale = 1, tint = 0xffffff) {
    particles.ground.spawn({ tex: textures.ring, x, y, life: 520, s0: .1 * scale, s1: 1.25 * scale, sy: .42, a0: .95, a1: 0, tint, add: true });
  }
  function flare(x, y, size = 2.2, tint = 0xffffff, life = 260) {
    particles.fx.spawn({ tex: textures.glow, x, y, life, s0: size * .4, s1: size, a0: 1, a1: 0, tint, add: true });
  }
  function fireBurst(x, y, n = 46) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), v = rand(120, 520);
      particles.fx.spawn({ tex: textures.glow, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .6 - 180, g: -260, drag: .9, life: rand(380, 900),
        s0: rand(.45, .9), s1: rand(.05, .2), a0: 1, a1: 0, tint: pick(FIRE), add: true });
    }
    for (let i = 0; i < 12; i++) {
      particles.fx.spawn({ tex: textures.soft, x: x + rand(-30, 30), y: y + rand(-30, 10), vx: rand(-60, 60), vy: rand(-140, -60), drag: .96, life: rand(900, 1500),
        s0: .5, s1: 1.4, a0: .55, a1: 0, tint: pick([0x5a4a40, 0x6b5a4c, 0x3d332c]), delay: rand(80, 220) });
    }
  }
  function scorch(x, y) {
    const s = new PIXI.Sprite(textures.shadow);
    s.anchor.set(.5); s.x = x; s.y = y; s.scale.set(1.5, .62); s.alpha = .85; s.tint = 0x2a1206;
    layers.decals.addChild(s);
    tween(s, { alpha: 0 }, 3200, ease.inCubic).then(() => s.destroy());
  }
  function floatText(x, y, text, color = 0xffffff, size = 46, stroke = 0x2c1a12) {
    const t = new PIXI.Text({ text, style: { fontFamily: 'Georgia, serif', fontWeight: '900', fontSize: size, fill: color,
      stroke: { color: stroke, width: Math.round(size / 6), join: 'round' }, dropShadow: { color: 0x000000, alpha: .45, blur: 2, distance: 4, angle: Math.PI / 2 } } });
    t.resolution = 2; t.anchor.set(.5); t.x = x; t.y = y; t.scale.set(.2); layers.ui.addChild(t);
    tween(t, { 'scale.x': 1.15, 'scale.y': 1.15 }, 180, ease.outBack)
      .then(() => tween(t, { 'scale.x': 1, 'scale.y': 1 }, 120))
      .then(() => Promise.all([tween(t, { y: y - 70 }, 900, ease.outCubic), wait(450).then(() => tween(t, { alpha: 0 }, 450))]))
      .then(() => t.destroy());
    return t;
  }

  // ---------- Fichas animadas ----------
  function addToken(piece) {
    const id = piece.cell;
    const tex = imageTextures[`assets/clay/fichas/${piece.side === 'I' ? 'idealista' : 'realista'}-${piece.animal}.webp`];
    const root = new PIXI.Container();               // posición en el suelo
    const body = new PIXI.Container();               // altura (salto) y rebotes
    const sprite = new PIXI.Sprite(tex);
    sprite.anchor.set(.5, 1);
    const size = tokenSize(id);
    sprite.width = size; sprite.scale.y = sprite.scale.x;
    const shadow = new PIXI.Sprite(textures.shadow);
    shadow.anchor.set(.5); shadow.width = size * .95; shadow.height = size * .28; shadow.y = -size * .02;
    const flash = new PIXI.ColorMatrixFilter();
    body.addChild(sprite);
    root.addChild(body);
    layers.shadows.addChild(shadow);
    const p = foot(id);
    root.x = p.x; root.y = p.y;
    layers.tokens.addChild(root);
    const t = { piece, root, body, sprite, shadow, flash, base: sprite.scale.x, size, cell: id, phase: Math.random() * 6.28,
      lift: 0, squash: 0, lean: 0, idle: true, flashAmt: 0 };
    tokens[piece.id] = t;
    return t;
  }
  function updateToken(t) {
    const breathe = t.idle && !reduced ? Math.sin(clock.now / 620 + t.phase) : 0;
    const sx = 1 + t.squash * .9 + breathe * .012, sy = 1 - t.squash + breathe * .02;
    t.sprite.scale.set(t.base * sx, t.base * sy);
    t.body.y = -t.lift - (t.idle && !reduced ? Math.max(0, breathe) * 1.2 : 0);
    t.body.rotation = t.lean + (t.idle && !reduced ? Math.sin(clock.now / 900 + t.phase) * .012 : 0);
    t.shadow.x = t.root.x; t.shadow.y = t.root.y - t.size * .02;
    const h = Math.min(1, t.lift / 220);
    t.shadow.alpha = (1 - h * .65) * t.root.alpha;
    t.shadow.width = t.size * .95 * (1 - h * .45); t.shadow.height = t.size * .28 * (1 - h * .45);
    t.root.zIndex = Math.round(t.root.y);
    // El filtro de destello solo se aplica mientras dura: en móvil los filtros son costosos.
    if (t.flashAmt > 0.01) {
      t.flash.brightness(1 + t.flashAmt * 3, false);
      if (!t.sprite.filters) t.sprite.filters = [t.flash];
    } else if (t.sprite.filters) t.sprite.filters = null;
  }
  async function hopTo(t, cell, { height = 90, ms = 380 } = {}) {
    t.idle = false;
    await tween(t, { squash: .16, lean: 0 }, 110, ease.outCubic);
    audio.sfx.hop();
    tween(t, { squash: -.12 }, ms * .4);
    await arcMove(t, cell, height, ms);
    audio.sfx.land(); dust(t.root.x, t.root.y, 10);
    await tween(t, { squash: .2 }, 70);
    await tween(t, { squash: 0 }, 260, ease.outElastic);
    t.idle = true;
  }
  // Salto en arco controlado por un parámetro k que el ticker traduce a posición.
  const arcs = new Set();
  function arcMove(t, cell, height, ms, easing = ease.inOutCubic) {
    const to = foot(cell), from = { x: t.root.x, y: t.root.y };
    const a = { t, from, to, height, k: 0 };
    arcs.add(a);
    return tween(a, { k: 1 }, ms, easing).then(() => { arcs.delete(a); t.root.x = to.x; t.root.y = to.y; t.lift = 0; t.cell = cell; });
  }
  function updateArcs() {
    for (const a of arcs) {
      a.t.root.x = a.from.x + (a.to.x - a.from.x) * a.k;
      a.t.root.y = a.from.y + (a.to.y - a.from.y) * a.k;
      a.t.lift = Math.sin(Math.PI * a.k) * a.height;
    }
  }
  async function strike(attacker, defenderCell, { height = 110, ms = 360, trail = null } = {}) {
    attacker.idle = false;
    const dir = Math.sign(foot(defenderCell).x - attacker.root.x) || 1;
    await tween(attacker, { squash: .15, lean: -.16 * dir }, 220, ease.outCubic);
    audio.sfx.whoosh(ms / 1000);
    tween(attacker, { squash: -.18, lean: .22 * dir }, ms * .5);
    // Se detiene un poco antes del centro rival: el golpe ocurre en el contacto.
    const target = foot(defenderCell);
    const stopAt = { x: target.x - (target.x - attacker.root.x) * .38, y: target.y - (target.y - attacker.root.y) * .38 };
    const fake = '__contact';
    cells[fake] = { x: stopAt.x, y: stopAt.y - cells[defenderCell].h * .2, w: cells[defenderCell].w, h: cells[defenderCell].h };
    const trailTimer = trail ? setInterval(() => trail(attacker), 16) : null;
    await arcMove(attacker, fake, height, ms, ease.inCubic);
    clearInterval(trailTimer);
    delete cells[fake];
  }
  function hitFlash(t, amount = 1, ms = 180) {
    t.flashAmt = amount;
    return tween(t, { flashAmt: 0 }, ms, ease.outCubic);
  }
  async function knockOut(t, dirX, power = 1) {
    t.idle = false;
    hitFlash(t, 1.2, 260);
    audio.sfx.ko();
    const v = { vx: dirX * rand(380, 520) * power, vy: -rand(900, 1150) * power, spin: dirX * rand(9, 14) };
    const start = { x: t.root.x, y: t.root.y };
    const launch = { t, v, start, time: 0 };
    flights.add(launch);
    await wait(1100);
    flights.delete(launch);
    t.root.visible = false; t.shadow.visible = false;
  }
  const flights = new Set();
  function updateFlights(dt) {
    for (const f of flights) {
      f.time += dt / 1000;
      f.t.root.x = f.start.x + f.v.vx * f.time;
      f.t.lift = Math.max(-40, -(f.v.vy * f.time + 1300 * f.time * f.time));
      f.t.body.rotation += f.v.spin * dt / 1000;
      f.t.root.alpha = Math.max(0, 1 - f.time / 1.1);
      if (Math.random() < .5) particles.fx.spawn({ tex: textures.soft, x: f.t.root.x, y: f.t.root.y - f.t.lift - f.t.size * .4, life: 400, s0: .35, s1: .7, a0: .35, a1: 0, tint: 0xd8c8a8 });
    }
  }
  async function respawn(t, cell) {
    const p = foot(cell);
    t.root.x = p.x; t.root.y = p.y; t.lift = 0; t.cell = cell; t.body.rotation = 0; t.lean = 0; t.squash = 0;
    t.root.alpha = 1; t.root.visible = true; t.shadow.visible = true; t.idle = true;
    t.sprite.alpha = 0; t.squash = -.4;
    audio.sfx.poof();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      particles.fx.spawn({ tex: textures.soft, x: p.x, y: p.y - t.size * .45, vx: Math.cos(a) * 180, vy: Math.sin(a) * 110, drag: .88, life: 600, s0: .35, s1: .8, a0: .8, a1: 0, tint: 0xfff4dc });
    }
    await Promise.all([tween(t.sprite, { alpha: 1 }, 220), tween(t, { squash: 0 }, 520, ease.outElastic)]);
  }

  // ---------- Cámara ----------
  function createCamera() {
    return { fx: W / 2, fy: H / 2, zoom: 1, trauma: 0, base: 1, ox: 0, oy: 0, t: 0 };
  }
  function layout() {
    const vw = app.screen.width, vh = app.screen.height;
    const portrait = vw / vh < .8;
    if (portrait) {
      cam.base = Math.max(vw / W, vh / H);
      cam.ox = (vw - W * cam.base) / 2;
      cam.oy = Math.min(0, vh - H * cam.base);
    } else {
      const visibleH = H - SKY_CROP;
      cam.base = Math.min(vw / W, (vh - 40) / visibleH);
      cam.ox = (vw - W * cam.base) / 2;
      cam.oy = (vh - visibleH * cam.base) / 2 - SKY_CROP * cam.base;
    }
    screenFx.flash.clear().rect(0, 0, vw, vh).fill({ color: 0xffffff });
    screenFx.vignette.width = Math.max(vw, vh) * 1.5; screenFx.vignette.height = Math.max(vw, vh) * 1.5; screenFx.vignette.x = vw / 2; screenFx.vignette.y = vh / 2;
    screenFx.title.x = vw / 2; screenFx.title.y = vh * .3;
    screenFx.sub.x = vw / 2; screenFx.sub.y = vh * .3 + 58;
  }
  function updateCamera(dtReal) {
    cam.t += dtReal / 1000;
    cam.trauma = Math.max(0, cam.trauma - dtReal / 1000 * 1.6);
    const s = reduced ? 0 : cam.trauma * cam.trauma;
    const sx = s * 26 * (Math.sin(cam.t * 47) + Math.sin(cam.t * 83) * .5);
    const sy = s * 22 * (Math.sin(cam.t * 59 + 1) + Math.sin(cam.t * 97) * .5);
    const z = reduced ? 1 : cam.zoom;
    world.scale.set(cam.base * z);
    world.pivot.set(cam.fx, cam.fy);
    world.position.set(cam.ox + cam.base * cam.fx + sx, cam.oy + cam.base * cam.fy + sy);
    world.rotation = s * .015 * Math.sin(cam.t * 31);
  }
  function camTo(x, y, zoom, ms, easing = ease.inOutCubic) {
    return tween(cam, { fx: x, fy: y, zoom }, ms, easing);
  }
  const camHome = (ms = 600) => camTo(W / 2, H / 2, 1, ms);
  function shake(amount) { cam.trauma = Math.min(1, cam.trauma + amount); }

  // ---------- Capas de pantalla ----------
  function buildScreenFx() {
    const c = new PIXI.Container();
    const flash = new PIXI.Graphics(); flash.alpha = 0; flash.blendMode = 'add';
    const vignette = new PIXI.Sprite(textures.vignette); vignette.anchor.set(.5); vignette.alpha = 0;
    const title = new PIXI.Text({ text: '', style: { fontFamily: 'Georgia, serif', fontWeight: '900', fontSize: 54, fill: 0xfff7e6,
      stroke: { color: 0x2c1a12, width: 9, join: 'round' }, dropShadow: { color: 0xff7a2a, alpha: .9, blur: 18, distance: 0 }, letterSpacing: 2, align: 'center' } });
    title.anchor.set(.5); title.alpha = 0;
    const sub = new PIXI.Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontWeight: '800', fontSize: 20, fill: 0xfff4d8,
      stroke: { color: 0x2c1a12, width: 5, join: 'round' }, align: 'center' } });
    sub.anchor.set(.5); sub.alpha = 0;
    c.addChild(vignette, flash, title, sub);
    return { container: c, flash, vignette, title, sub };
  }
  async function showTitle(text, sub, color = 0xff7a2a) {
    const { title, sub: s } = screenFx;
    title.text = text; title.style.dropShadow = { color, alpha: .9, blur: 18, distance: 0, angle: 0 }; s.text = sub || '';
    const vw = app.screen.width;
    title.style.fontSize = 54;
    // Ajuste al ancho: el título nunca se sale de la pantalla.
    if (title.width > vw * .9) title.style.fontSize = Math.floor(54 * vw * .9 / title.width);
    title.alpha = 1; title.scale.set(2.6); s.alpha = 0;
    audio.sfx.title();
    await tween(title, { 'scale.x': 1, 'scale.y': 1 }, 260, ease.outBack);
    shake(.25);
    tween(s, { alpha: 1 }, 200);
    await wait(900);
    await Promise.all([tween(title, { alpha: 0, 'scale.x': 1.1, 'scale.y': 1.1 }, 300), tween(s, { alpha: 0 }, 300)]);
  }
  function screenFlash(peak = .85, ms = 160) {
    screenFx.flash.alpha = peak;
    return tween(screenFx.flash, { alpha: 0 }, ms, ease.outCubic);
  }

  // ---------- Cartas ----------
  let cardSheet = null;
  const CARD_INDEX = { boost: [0, 0], weaken: [1, 0], major: [2, 0], decisive: [0, 1], cannon: [1, 1], search: [2, 1] };
  function cardTexture(card) {
    const [c, r] = CARD_INDEX[card];
    const fw = cardSheet.width / 3, fh = cardSheet.height / 2;
    return new PIXI.Texture({ source: cardSheet.source, frame: new PIXI.Rectangle(c * fw, r * fh, fw, fh) });
  }
  // Quién juega la carta debe leerse de un vistazo: el dueño brilla con el color de su
  // bando, la carta sale de su lado (atacante a la izquierda, defensor a la derecha) con su
  // nombre encima, y viaja con estela hasta la ficha afectada, donde aparece el número.
  const SIDE_COLOR = { I: 0x5ac8ff, R: 0xff6a4a };
  const SIDE_STROKE = { I: 0x12364c, R: 0x5a1410 };
  const SIDE_NAME = { I: 'idealista', R: 'realista' };
  const ANIMAL_NAME = { mono: 'Mono', llama: 'Llama', guacamayo: 'Guacamayo', rana: 'Rana', tigrillo: 'Tigrillo', gallo: 'Gallo', cuy: 'Cuy', gato: 'Gato' };
  const nameOf = t => ANIMAL_NAME[t.piece.animal] + ' ' + SIDE_NAME[t.piece.side];
  // Convierte un punto del mundo para que quede dentro de la pantalla (con márgenes en píxeles de pantalla).
  function clampToView(x, y, mx, my) {
    const g = world.toGlobal(new PIXI.Point(x, y));
    const vw = app.screen.width, vh = app.screen.height;
    g.x = Math.min(Math.max(g.x, mx), vw - mx);
    g.y = Math.min(Math.max(g.y, my + 70), vh - my - 110);
    const l = world.toLocal(g);
    return { x: l.x, y: l.y };
  }
  async function playCard(card, owner, target, label, color, good = label.startsWith('+')) {
    const sideX = owner === tokens.I5 ? -1 : 1;
    const ownerColor = SIDE_COLOR[owner.piece.side];
    // 1. El dueño se ilumina con el color de su bando.
    const ring = new PIXI.Sprite(textures.ring);
    ring.anchor.set(.5); ring.tint = ownerColor;
    ring.x = owner.root.x; ring.y = owner.root.y - owner.size * .5; ring.width = ring.height = owner.size * 1.2; ring.alpha = 0;
    layers.ui.addChild(ring);
    tween(ring, { alpha: 1, 'scale.x': ring.scale.x * 1.25, 'scale.y': ring.scale.y * 1.25 }, 260, ease.outCubic);
    hitFlash(owner, .35, 260);
    // 2. La carta nace junto al dueño, de su lado, con su nombre.
    const s = new PIXI.Sprite(cardTexture(card));
    s.anchor.set(.5); s.width = 150; s.scale.y = s.scale.x;
    const base = s.scale.x;
    s.x = owner.root.x + sideX * 40; s.y = owner.root.y - owner.size * .5; s.rotation = sideX * .4; s.alpha = 0;
    layers.ui.addChild(s);
    const tag = new PIXI.Text({ text: nameOf(owner), style: { fontFamily: 'system-ui, sans-serif', fontWeight: '800', fontSize: 22, fill: 0xffffff,
      stroke: { color: 0x2c1a12, width: 5, join: 'round' } } });
    tag.resolution = 2; tag.anchor.set(.5, 1); tag.alpha = 0; layers.ui.addChild(tag);
    const tagBg = new PIXI.Graphics(); tagBg.alpha = 0; layers.ui.addChildAt(tagBg, layers.ui.getChildIndex(tag));
    audio.sfx.card();
    const hold = clampToView(owner.root.x + sideX * 175, owner.root.y - owner.size * 1.1, 95, 130);
    s.scale.set(base * .2);
    await tween(s, { x: hold.x, y: hold.y, rotation: sideX * .06, alpha: 1, 'scale.x': base, 'scale.y': base }, 420, ease.outBack);
    tag.x = s.x; tag.y = s.y - s.height / 2 - 6;
    const tw = tag.width + 18, th = tag.height + 6;
    tagBg.clear().roundRect(tag.x - tw / 2, tag.y - th + 2, tw, th, 10).fill({ color: ownerColor, alpha: .92 });
    tween(tag, { alpha: 1 }, 160); tween(tagBg, { alpha: 1 }, 160);
    flare(s.x, s.y, 1.6, color, 380);
    await wait(650);
    tween(ring, { alpha: 0 }, 250).then(() => ring.destroy());
    tween(tag, { alpha: 0 }, 150).then(() => tag.destroy()); tween(tagBg, { alpha: 0 }, 150).then(() => tagBg.destroy());
    // 3. Viaja hasta la ficha afectada dejando estela del color de la carta.
    audio.sfx.whoosh(.25);
    const trail = setInterval(() => particles.fx.spawn({ tex: textures.glow, x: s.x, y: s.y, life: 320, s0: .5, s1: .05, a0: .8, a1: 0, tint: color, add: true }), 16);
    await tween(s, { x: target.root.x, y: target.root.y - target.size * .55, 'scale.x': base * .15, 'scale.y': base * .15, alpha: .7 }, target === owner ? 240 : 380, ease.inCubic);
    clearInterval(trail);
    s.destroy();
    // 4. El efecto aparece sobre la ficha que lo recibe.
    flare(target.root.x, target.root.y - target.size * .55, 2, color, 320);
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2);
      particles.fx.spawn({ tex: textures.star, x: target.root.x, y: target.root.y - target.size * .55, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260 - 100, g: 300, drag: .9,
        life: 600, s0: .45, s1: .05, a0: 1, a1: 0, tint: color, add: true, vr: 6 });
    }
    hitFlash(target, .5, 220);
    if (!good) { target.idle = false; tween(target, { squash: .14 }, 120).then(() => tween(target, { squash: 0 }, 380, ease.outElastic)).then(() => { target.idle = true; }); }
    // El número aparece al costado de la ficha afectada (no entre las dos) y con el contorno de su bando.
    const side = target === tokens.I5 ? -1 : 1;
    floatText(target.root.x + side * target.size * .62, target.root.y - target.size * 1.02, label, color, 46, SIDE_STROKE[target.piece.side]);
    // Anillo del color de la carta alrededor de la ficha afectada: une el número con su ficha.
    const mark = new PIXI.Sprite(textures.ring);
    mark.anchor.set(.5); mark.tint = color; mark.x = target.root.x; mark.y = target.root.y - target.size * .5;
    mark.width = mark.height = target.size * 1.35; layers.ui.addChild(mark);
    tween(mark, { 'scale.x': mark.scale.x * .82, 'scale.y': mark.scale.y * .82 }, 260, ease.outBack)
      .then(() => wait(500)).then(() => tween(mark, { alpha: 0 }, 300)).then(() => mark.destroy());
    good ? audio.sfx.buff() : audio.sfx.debuff();
    await wait(420);
  }
  function coinsBurst(x, y, amount) {
    for (let i = 0; i < 10; i++) {
      const p = particles.fx.spawn({ tex: textures.glow, x, y, vx: rand(-260, 260), vy: rand(-760, -480), g: 1700, drag: .99, life: 900,
        s0: .32, s1: .28, a0: 1, a1: 0, tint: 0xffd34d, add: true, delay: i * 40 });
      if (p) setTimeout(() => audio.sfx.coin(i % 5), i * 45);
    }
    floatText(x, y - 40, '+' + amount, 0xffd34d, 40, 0x5a3a08);
  }
  // Marcador en la pantalla (no en el tablero) para no tapar fichas.
  function scoreBanner(text) {
    const t = new PIXI.Text({ text, style: { fontFamily: 'Georgia, serif', fontWeight: '900', fontSize: 64, fill: 0xfff7e6,
      stroke: { color: 0x2c1a12, width: 10, join: 'round' }, dropShadow: { color: 0xffd34d, alpha: .8, blur: 14, distance: 0, angle: 0 } } });
    t.resolution = 2; t.anchor.set(.5); t.x = app.screen.width / 2; t.y = app.screen.height * .2; t.scale.set(.3);
    screenFx.container.addChild(t);
    tween(t, { 'scale.x': 1, 'scale.y': 1 }, 260, ease.outBack)
      .then(() => wait(1100)).then(() => tween(t, { alpha: 0, y: t.y - 30 }, 400)).then(() => t.destroy());
  }

  // ---------- Ambiente ----------
  function ambient(dt) {
    if (reduced) return;
    if (Math.random() < dt / 140) {
      particles.ambient.spawn({ tex: textures.soft, x: rand(0, W), y: rand(380, 1180), vx: rand(-14, 14), vy: rand(-22, -8), life: rand(3000, 6000),
        s0: rand(.06, .12), s1: rand(.04, .1), a0: .75, a1: 0, tint: pick([0xfff7c0, 0xffffff, 0xffe0f0]), add: true });
    }
  }

  // ---------- Secuencias ----------
  const caption = byId('demo-caption');
  const say = t => { caption.textContent = t; };
  let busy = false;
  const buttons = [...document.querySelectorAll('[data-scene]')];
  async function run(name) {
    if (busy) return;
    busy = true; buttons.forEach(b => { b.disabled = true; });
    const A = tokens.I5, D = tokens.R4;
    try {
      await SCENES[name](A, D);
      await wait(900);
      // Reinicio: el tigrillo vuelve a su casilla y el gallo reaparece.
      say('Preparando el siguiente combate…');
      await Promise.all([A.cell !== 'C6' ? hopTo(A, 'C6') : null, respawn(D, 'C8')]);
      say('Elige otro ataque.');
    } finally {
      busy = false; buttons.forEach(b => { b.disabled = false; });
    }
  }
  const SCENES = {
    async normal(A, D) {
      say('Ataque con cartas: el tigrillo ataca al gallo.');
      await camTo((A.root.x + D.root.x) / 2, (A.root.y + D.root.y) / 2 - 40, 1.25, 700);
      floatText(A.root.x, A.root.y - A.size * 1.4, '¡Al ataque!', 0xfff7e6, 34);
      await wait(500);
      // Orden del reglamento: defensor, atacante, defensor, atacante.
      say('El gallo se defiende con Refuerzo: +1 para el gallo.');
      await playCard('boost', D, D, '+1', 0x7fe07a);
      say('El tigrillo juega Debilitar contra el gallo: −1 para el gallo.');
      await playCard('weaken', A, D, '−1', 0xb48aff);
      say('El tigrillo remata con Refuerzo mayor: +2 para el tigrillo.');
      await playCard('major', A, A, '+2', 0x7fe07a);
      say('Fuerza: tigrillo 2 contra gallo 0.');
      await strike(A, D.cell, { height: 120, ms: 340 });
      await hitStop(70);
      audio.sfx.impact(.8);
      const hx = D.root.x, hy = D.root.y - D.size * .5;
      flare(hx, hy, 2.2); sparks(hx, hy, 24, 820); chunks(hx, hy, 'R', 10); shockwave(D.root.x, D.root.y, .9); dust(D.root.x, D.root.y, 10);
      shake(.45); tween(cam, { zoom: 1.32 }, 90).then(() => tween(cam, { zoom: 1.25 }, 300));
      knockOut(D, 1, .9);
      await arcMove(A, D.cell, 40, 300, ease.outCubic);
      audio.sfx.land(); dust(A.root.x, A.root.y, 12); tween(A, { squash: 0, lean: 0 }, 400, ease.outElastic); A.idle = true;
      coinsBurst(A.root.x, A.root.y - A.size * 1.2, 20);
      scoreBanner('2 – 0');
      audio.sfx.cheer();
      say('Gana el tigrillo 2 a 0 y avanza a la casilla libre. +20 monedas.');
      await wait(900);
      await camHome();
    },
    async fire(A, D) {
      say('Fuego Especial: +3 de fuerza.');
      layers.focus.addChild(A.root); layers.focus.addChild(D.root);
      tween(layers.dim, { alpha: .58 }, 400);
      tween(screenFx.vignette, { alpha: .9 }, 400);
      audio.duck(.08);
      await camTo(A.root.x, A.root.y - 90, 1.55, 650);
      const rune = new PIXI.Sprite(textures.rune); rune.anchor.set(.5); rune.x = A.root.x; rune.y = A.root.y; rune.tint = 0xffa02e; rune.blendMode = 'add';
      rune.scale.set(0); rune.alpha = .9; layers.decals.addChild(rune);
      const aura = new PIXI.Sprite(textures.glow); aura.anchor.set(.5, .62); aura.tint = 0xff7a2a; aura.blendMode = 'add'; aura.alpha = 0;
      aura.width = A.size * 2.6; aura.height = A.size * 3; A.root.addChildAt(aura, 0);
      tween(rune, { 'scale.x': .9, 'scale.y': .36 }, 500, ease.outBack);
      tween(aura, { alpha: .85 }, 500);
      audio.sfx.fireIgnite(); audio.sfx.fireRoar(1.5);
      showTitle('FUEGO ESPECIAL', 'Tigrillo idealista · +3 de fuerza');
      // Carga: brasas que convergen en la ficha y tres segmentos que se encienden.
      const segs = [];
      for (let i = 0; i < 3; i++) {
        const g = new PIXI.Graphics();
        const a0 = -Math.PI / 2 + i * (Math.PI * 2 / 3) + .12, a1 = a0 + Math.PI * 2 / 3 - .24;
        g.arc(0, 0, A.size * .78, a0, a1).stroke({ width: 10, color: 0xffd34d, cap: 'round' });
        g.x = A.root.x; g.y = A.root.y - A.size * .52; g.alpha = 0; g.blendMode = 'add';
        layers.ui.addChild(g); segs.push(g);
      }
      A.idle = false;
      const chargeStart = clock.now;
      const charging = setInterval(() => {
        const cx = A.root.x, cy = A.root.y - A.size * .5;
        for (let i = 0; i < 3; i++) {
          const a = rand(0, Math.PI * 2), r = rand(120, 230);
          particles.fx.spawn({ tex: textures.glow, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * .8, vx: -Math.cos(a) * r * 2.4 + Math.sin(a) * 120, vy: -Math.sin(a) * r * 2 - Math.cos(a) * 90,
            drag: .97, life: 420, s0: .15, s1: .4, a0: .2, a1: 1, tint: pick(FIRE), add: true });
        }
        particles.fx.spawn({ tex: textures.glow, x: cx + rand(-20, 20), y: A.root.y, vy: rand(-260, -160), vx: rand(-30, 30), life: 600, s0: .5, s1: .05, a0: .9, a1: 0, tint: pick(FIRE), add: true });
        A.squash = .05 * Math.sin((clock.now - chargeStart) / 40);
        rune.rotation += .05;
      }, 16);
      for (let i = 0; i < 3; i++) {
        await wait(380);
        audio.sfx.segment(i);
        segs[i].alpha = 1; flare(segs[i].x, segs[i].y, 1.2, 0xffd34d, 260); shake(.08);
      }
      await wait(250);
      clearInterval(charging);
      segs.forEach(g => tween(g, { alpha: 0 }, 200).then(() => g.destroy()));
      tween(rune, { alpha: 0 }, 400).then(() => rune.destroy());
      // Embestida con estela de fuego e imágenes residuales.
      await camTo((A.root.x + D.root.x) / 2, (A.root.y + D.root.y) / 2 - 60, 1.4, 260);
      let ghostTick = 0;
      await strike(A, D.cell, { height: 36, ms: 230, trail: t => {
        const cx = t.root.x, cy = t.root.y - t.lift - t.size * .5;
        for (let i = 0; i < 4; i++) particles.fx.spawn({ tex: textures.glow, x: cx + rand(-16, 16), y: cy + rand(-20, 20), vx: rand(-60, 60), vy: rand(-120, -40), life: rand(260, 480), s0: rand(.4, .7), s1: .05, a0: .95, a1: 0, tint: pick(FIRE), add: true });
        if (ghostTick++ % 3 === 0) {
          const g = new PIXI.Sprite(t.sprite.texture); g.anchor.set(.5, 1); g.scale.copyFrom(t.sprite.scale); g.x = t.root.x; g.y = t.root.y - t.lift;
          g.tint = 0xff7a2a; g.alpha = .55; g.blendMode = 'add'; layers.fx.addChild(g); tween(g, { alpha: 0 }, 260).then(() => g.destroy());
        }
      } });
      // Impacto: pausa, destello de pantalla, explosión, onda y cámara.
      const hx = D.root.x, hy = D.root.y - D.size * .5;
      flare(hx, hy, 3.2, 0xfff3a0, 200);
      screenFlash(.9, 200);
      await hitStop(130);
      audio.sfx.explosion();
      fireBurst(hx, hy, 60); sparks(hx, hy, 40, 1200, [0xffffff, ...FIRE]); chunks(hx, hy, 'R', 18, 1.3);
      shockwave(D.root.x, D.root.y, 1.4, 0xffd34d); setTimeout(() => shockwave(D.root.x, D.root.y, 2, 0xff7a2a), 90);
      scorch(D.root.x, D.root.y); dust(D.root.x, D.root.y, 18, 1.6);
      shake(.95);
      tween(cam, { zoom: 1.62 }, 70).then(() => tween(cam, { zoom: 1.4 }, 420, ease.outCubic));
      knockOut(D, 1, 1.25);
      aura.parent?.removeChild(aura); aura.destroy();
      await arcMove(A, D.cell, 50, 320, ease.outCubic);
      audio.sfx.land(); dust(A.root.x, A.root.y, 14); tween(A, { squash: 0, lean: 0 }, 420, ease.outElastic); A.idle = true;
      tween(screenFx.vignette, { alpha: 0 }, 500);
      tween(layers.dim, { alpha: 0 }, 500).then(() => { layers.tokens.addChild(A.root); layers.tokens.addChild(D.root); });
      coinsBurst(A.root.x, A.root.y - A.size * 1.2, 30);
      scoreBanner('3 – 0');
      audio.sfx.cheer(); audio.duck(.22);
      say('El Fuego Especial gana 3 a 0. +30 monedas (combate potente y baja).');
      await wait(1000);
      await camHome(700);
    },
    async decisive(A, D) {
      say('Golpe decisivo: gana el combate aunque el rival tenga más fuerza.');
      await camTo((A.root.x + D.root.x) / 2, (A.root.y + D.root.y) / 2 - 40, 1.25, 600);
      say('El gallo se defiende con Refuerzo: +1 para el gallo.');
      await playCard('boost', D, D, '+1', 0x7fe07a);
      say('El tigrillo juega Golpe decisivo: gana aunque tenga menos fuerza.');
      await playCard('decisive', A, A, '¡Decisivo!', 0xff5a3a, true);
      tween(screenFx.vignette, { alpha: .8 }, 500);
      audio.duck(.06);
      A.idle = false;
      await tween(A, { squash: .3, lean: -.25 }, 420, ease.outCubic);
      audio.sfx.slowIn();
      // Cámara lenta: el tiempo se frena justo antes del contacto.
      if (!reduced) tween(clock, { scale: .32 }, 100, ease.linear);
      camTo(D.root.x, D.root.y - D.size * .55, 1.9, 520);
      tween(A, { squash: -.2, lean: .3 }, 120);
      await strike(A, D.cell, { height: 70, ms: 420 });
      // Contacto congelado: desaturación, grietas y título.
      const desat = new PIXI.ColorMatrixFilter(); desat.saturate(-.85, false); world.filters = [desat];
      const hx = D.root.x, hy = D.root.y - D.size * .5;
      const cracks = new PIXI.Graphics();
      for (let i = 0; i < 9; i++) {
        let x = hx, y = hy; const a = i / 9 * Math.PI * 2 + rand(-.2, .2);
        cracks.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += Math.cos(a + rand(-.5, .5)) * rand(30, 60); y += Math.sin(a + rand(-.5, .5)) * rand(30, 60); cracks.lineTo(x, y); }
      }
      cracks.stroke({ width: 4, color: 0xffffff, alpha: .95 }); cracks.blendMode = 'add'; layers.ui.addChild(cracks);
      flare(hx, hy, 1.2, 0xffe0c0, 300);
      clock.scale = 0;
      audio.sfx.shatter();
      await new Promise(r => setTimeout(r, reduced ? 200 : 520));
      showTitle('¡GOLPE DECISIVO!', 'Gana el combate', 0xff3a2a);
      world.filters = null;
      clock.scale = 1;
      screenFlash(1, 260);
      sparks(hx, hy, 50, 1400); chunks(hx, hy, 'R', 34, 1.6); shockwave(D.root.x, D.root.y, 1.8); flare(hx, hy, 2.6, 0xffe0c0, 260);
      shake(1);
      tween(cracks, { alpha: 0 }, 600).then(() => cracks.destroy());
      // El gallo se rompe en pedazos de plastilina.
      D.root.visible = false; D.shadow.visible = false;
      tween(cam, { zoom: 1.3 }, 600, ease.outCubic);
      await arcMove(A, D.cell, 60, 360, ease.outCubic);
      audio.sfx.land(); dust(A.root.x, A.root.y, 16); tween(A, { squash: 0, lean: 0 }, 420, ease.outElastic); A.idle = true;
      tween(screenFx.vignette, { alpha: 0 }, 500);
      coinsBurst(A.root.x, A.root.y - A.size * 1.2, 30);
      audio.sfx.victory(); audio.duck(.22);
      say('El Golpe decisivo vence aunque el gallo tenía +1. +30 monedas.');
      await wait(900);
      await camHome(700);
    },
  };

  // ---------- Arranque ----------
  async function start() {
    byId('demo-loading').hidden = false;
    await app.init({ resizeTo: window, backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2) });
    byId('stage').append(app.canvas);
    textures = makeTextures();
    // Imágenes cargadas con <img> (no fetch): así la muestra funciona también abriendo el archivo local.
    const animals = new Set(rules.makeGame().pieces.map(p => (p.side === 'I' ? 'idealista-' : 'realista-') + p.animal));
    const urls = [...animals].map(n => `assets/clay/fichas/${n}.webp`).concat(['assets/v014/cartas-aprobadas.webp']);
    const images = await Promise.all(urls.map(src => new Promise((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve([src, img]); img.onerror = () => reject(new Error('No se pudo cargar ' + src)); img.src = src;
    })));
    for (const [src, img] of images) imageTextures[src] = PIXI.Texture.from(img);
    cardSheet = imageTextures['assets/v014/cartas-aprobadas.webp'];

    world = new PIXI.Container();
    layers = {};
    for (const name of ['bg', 'decals', 'shadows', 'groundFx', 'tokens', 'dim', 'focus', 'fx', 'ui']) { layers[name] = new PIXI.Container(); world.addChild(layers[name]); }
    // Oscurecimiento dentro de la escena: deja a la vista solo a los combatientes (capa focus).
    const dimRect = new PIXI.Graphics().rect(-400, -400, W + 800, H + 800).fill({ color: 0x0a0503 });
    layers.dim.addChild(dimRect); layers.dim.alpha = 0;
    layers.tokens.sortableChildren = true; layers.focus.sortableChildren = true;
    video = document.createElement('video');
    Object.assign(video, { src: 'assets/escenario/campo-andino.mp4', muted: true, loop: true, playsInline: true, preload: 'auto' });
    video.setAttribute('playsinline', '');
    await new Promise(r => { video.addEventListener('loadeddata', r, { once: true }); video.load(); setTimeout(r, 4000); });
    if (!reduced) video.play().catch(() => {});
    const bg = new PIXI.Sprite(PIXI.Texture.from(video)); bg.width = W; bg.height = H;
    layers.bg.addChild(bg);
    particles = { ground: createParticles(layers.groundFx, 200), fx: createParticles(layers.fx), ambient: createParticles(layers.fx, 60) };
    cam = createCamera();
    screenFx = buildScreenFx();
    app.stage.addChild(world, screenFx.container);

    const game = rules.makeGame();
    for (const piece of game.pieces) {
      if (piece.id === 'I5') piece.cell = 'C6';
      addToken(piece);
    }
    layout();
    window.addEventListener('resize', () => setTimeout(layout, 50));

    app.ticker.add(t => {
      const real = Math.min(50, t.deltaMS);
      const dt = real * clock.scale;
      clock.now += dt;
      for (const tw of tweens) {
        tw.t += dt;
        const k = Math.min(1, tw.t / tw.ms), e = tw.easing(k);
        for (const key of Object.keys(tw.to)) setPath(tw.target, key, tw.from[key] + (tw.to[key] - tw.from[key]) * e);
        if (k >= 1) { tweens.delete(tw); tw.resolve(); }
      }
      for (const tm of timers) if (clock.now >= tm.at) { timers.delete(tm); tm.resolve(); }
      updateArcs();
      updateFlights(dt);
      for (const tk of Object.values(tokens)) updateToken(tk);
      particles.ground.update(dt); particles.fx.update(dt); particles.ambient.update(dt);
      ambient(dt);
      updateCamera(real);
    });
    window.__muestra = { app, run, clock, tokens, particles, cam };
    byId('demo-start').hidden = true;
    audio.unlock();
    await wait(400);
    run('fire');
  }
  byId('demo-begin').addEventListener('click', () => { byId('demo-begin').disabled = true; start(); });
  buttons.forEach(b => b.addEventListener('click', () => run(b.dataset.scene)));
  const soundBtn = byId('demo-sound');
  const syncSound = () => {
    soundBtn.setAttribute('aria-pressed', String(audio.isOn()));
    soundBtn.setAttribute('aria-label', audio.isOn() ? 'Sonido activado' : 'Sonido desactivado');
  };
  soundBtn.addEventListener('click', () => { audio.setOn(!audio.isOn()); syncSound(); });
  syncSound();
})();
