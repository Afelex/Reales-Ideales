'use strict';
// Capa de partículas del combate con PixiJS (WebGL 2D), superpuesta al tablero.
// Trabaja en coordenadas de pantalla (las mismas que cellPoint() en app.js) y solo usa
// texturas generadas por código, así funciona también abriendo el juego como archivo local.
// Si WebGL no está disponible, todas las funciones son inofensivas y el juego conserva sus
// efectos CSS. Con prefers-reduced-motion se emiten muchas menos partículas.
(() => {
  const PIXI = window.PIXI;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let app = null, layer = null, textures = null, ready = false, starting = null, speed = 1;
  const list = [];
  const CAP = 600;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const FIRE = [0xfff3a0, 0xffd34d, 0xffa02e, 0xff6a1a, 0xe8431c];
  const TEAM = { I: [0x4a8fc4, 0x2f6a99, 0xe9d7b5], R: [0xd2553f, 0xa83a2c, 0xe9d7b5] };

  function canvasTexture(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return PIXI.Texture.from(c);
  }
  function makeTextures() {
    const radial = stops => canvasTexture(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    return {
      glow: radial([[0, 'rgba(255,255,255,1)'], [.35, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]),
      soft: radial([[0, 'rgba(255,255,255,.9)'], [.6, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]),
      shadow: radial([[0, 'rgba(20,10,5,.75)'], [.55, 'rgba(20,10,5,.4)'], [1, 'rgba(20,10,5,0)']]),
      spark: canvasTexture(64, 16, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.7, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2, h / 4, 0, 0, Math.PI * 2); g.fill();
      }),
      chunk: canvasTexture(32, 32, g => {
        g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(4, 10); g.lineTo(16, 3); g.lineTo(29, 9); g.lineTo(26, 26); g.lineTo(9, 29); g.closePath(); g.fill();
        g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.moveTo(9, 29); g.lineTo(26, 26); g.lineTo(29, 9); g.lineTo(22, 20); g.closePath(); g.fill();
      }),
      ring: canvasTexture(256, 256, (g, w) => { g.strokeStyle = '#fff'; g.lineWidth = 14; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 12, 0, Math.PI * 2); g.stroke(); }),
      star: canvasTexture(64, 64, g => {
        g.fillStyle = '#fff'; g.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 30, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
        g.closePath(); g.fill();
      }),
      rune: canvasTexture(256, 256, (g, w) => {
        g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(w / 2, w / 2, 110, 0, Math.PI * 2); g.stroke();
        g.lineWidth = 3; g.beginPath(); g.arc(w / 2, w / 2, 86, 0, Math.PI * 2); g.stroke();
        for (let i = 0; i < 12; i++) {
          const a = i * Math.PI / 6;
          g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 86, w / 2 + Math.sin(a) * 86); g.lineTo(w / 2 + Math.cos(a + .26) * 110, w / 2 + Math.sin(a + .26) * 110); g.stroke();
        }
      }),
    };
  }

  function start() {
    if (ready || starting || !PIXI) return starting;
    starting = (async () => {
      try {
        app = new PIXI.Application();
        await app.init({ resizeTo: window, backgroundAlpha: 0, antialias: false, autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2), powerPreference: 'low-power' });
        const canvas = app.canvas;
        canvas.className = 'combat-fx';
        canvas.setAttribute('aria-hidden', 'true');
        document.body.append(canvas);
        textures = makeTextures();
        layer = new PIXI.Container();
        app.stage.addChild(layer);
        app.ticker.add(t => update(Math.min(50, t.deltaMS) * speed));
        ready = true;
      } catch (error) {
        // Sin WebGL: el juego sigue con sus efectos CSS.
        app = null; ready = false;
      }
    })();
    return starting;
  }
  // El lienzo solo dibuja mientras hay partículas, para ahorrar batería.
  function wake() { if (ready && !app.ticker.started) app.ticker.start(); }

  function spawn(o) {
    if (!ready || list.length >= CAP) return null;
    const s = new PIXI.Sprite(o.tex || textures.glow);
    s.anchor.set(.5); s.x = o.x; s.y = o.y; s.tint = o.tint ?? 0xffffff;
    s.blendMode = o.add ? 'add' : 'normal'; s.rotation = o.rot ?? 0;
    layer.addChild(s);
    const p = { s, vx: o.vx || 0, vy: o.vy || 0, g: o.g || 0, drag: o.drag ?? 1, life: o.life || 600, t: 0,
      s0: o.s0 ?? 1, s1: o.s1 ?? 0, sy: o.sy ?? 1, a0: o.a0 ?? 1, a1: o.a1 ?? 0, vr: o.vr || 0, align: o.align, delay: o.delay || 0 };
    s.alpha = p.delay ? 0 : p.a0; s.scale.set(p.s0, p.s0 * p.sy);
    list.push(p);
    wake();
    return p;
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
      const sc = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) ** 3);
      p.s.scale.set(sc, sc * p.sy);
      p.s.alpha = p.a0 + (p.a1 - p.a0) * k;
      if (k >= 1) { p.s.destroy(); list.splice(i, 1); }
    }
    if (!list.length && app?.ticker.started) app.ticker.stop();
  }
  // Escala según el tamaño de la casilla en pantalla (los efectos crecen en tablet y escritorio).
  const unit = point => Math.max(.55, Math.min(1.6, (point?.size || 90) / 90));
  const many = n => Math.round(reduced() ? n * .3 : n);

  const api = {
    start,
    available: () => ready,
    setSpeed(v) { speed = v || 1; },
    clear() { for (const p of list) p.s.destroy(); list.length = 0; },
    count: () => list.length,
    dust(point, n = 10) {
      if (!point) return;
      const u = unit(point);
      for (let i = 0; i < many(n); i++) {
        const a = rand(Math.PI * .95, Math.PI * 2.05);
        spawn({ tex: textures?.soft, x: point.x + rand(-10, 10) * u, y: point.y + point.size * .3, vx: Math.cos(a) * rand(60, 190) * u, vy: Math.sin(a) * rand(15, 55) * u,
          drag: .9, life: rand(450, 800), s0: rand(.2, .32) * u, s1: rand(.55, .85) * u, sy: .6, a0: .6, a1: 0, tint: pick([0xe3cfa4, 0xd4b88a, 0xc9a873]) });
      }
    },
    sparks(point, n = 24, power = 1, colors = [0xffffff, 0xfff3a0, 0xffd34d]) {
      if (!point) return;
      const u = unit(point);
      for (let i = 0; i < many(n); i++) {
        const a = rand(0, Math.PI * 2), v = rand(320, 820) * power * u;
        spawn({ tex: textures?.spark, x: point.x, y: point.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, g: 900, drag: .92, life: rand(260, 520),
          s0: rand(.45, .8) * u, s1: .1, sy: .7, a0: 1, a1: 0, tint: pick(colors), add: true, align: true });
      }
    },
    // Trozos de plastilina del color del bando que pierde.
    chunks(point, side, n = 14, power = 1) {
      if (!point) return;
      const u = unit(point);
      for (let i = 0; i < many(n); i++) {
        const a = rand(-Math.PI * .95, -Math.PI * .05), v = rand(200, 560) * power * u;
        spawn({ tex: textures?.chunk, x: point.x + rand(-12, 12) * u, y: point.y + rand(-18, 6) * u, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1600, drag: .985,
          life: rand(650, 1050), s0: rand(.3, .6) * u, s1: rand(.25, .5) * u, a0: 1, a1: 0, vr: rand(-12, 12), tint: pick(TEAM[side] || TEAM.R) });
      }
    },
    shockwave(point, scale = 1, tint = 0xffffff) {
      if (!point) return;
      const u = unit(point) * scale;
      spawn({ tex: textures?.ring, x: point.x, y: point.y + point.size * .25, life: 520, s0: .08 * u, s1: .9 * u, sy: .42, a0: .95, a1: 0, tint, add: true });
    },
    flare(point, size = 1.6, tint = 0xffffff, life = 260) {
      if (!point) return;
      spawn({ tex: textures?.glow, x: point.x, y: point.y, life, s0: size * .4 * unit(point), s1: size * unit(point), a0: 1, a1: 0, tint, add: true });
    },
    scorch(point) {
      if (!point) return;
      const u = unit(point);
      spawn({ tex: textures?.shadow, x: point.x, y: point.y + point.size * .28, life: 2600, s0: 1.1 * u, s1: 1.2 * u, sy: .42, a0: .75, a1: 0, tint: 0x2a1206 });
    },
    // Impacto completo del combate: destello, chispas, trozos, ondas y polvo.
    impact(point, loserSide, power = 1) {
      if (!point) return;
      api.flare(point, 2 + power, 0xfff3a0, 220);
      api.sparks(point, 22 + power * 14, .9 + power * .3);
      api.chunks(point, loserSide, 10 + power * 6, .9 + power * .3);
      api.shockwave(point, 1 + power * .3);
      if (power > 1) setTimeout(() => api.shockwave(point, 1.6, 0xffd34d), 90);
      api.dust(point, 10 + power * 4);
      if (power > 1) api.scorch(point);
    },
    // Fuego Especial: brasas que suben y convergen sobre la ficha durante la carga.
    fireCharge(point, ms = 2000) {
      if (!point || !ready) return;
      const u = unit(point);
      const rune = spawn({ tex: textures.rune, x: point.x, y: point.y + point.size * .25, life: ms, s0: .25 * u, s1: .7 * u, sy: .4, a0: .9, a1: 0, tint: 0xffa02e, add: true, vr: 1.6 });
      void rune;
      const end = performance.now() + ms * .85;
      const tick = () => {
        if (performance.now() > end || !ready) return;
        const cx = point.x, cy = point.y;
        for (let i = 0; i < (reduced() ? 1 : 3); i++) {
          const a = rand(0, Math.PI * 2), r = rand(70, 140) * u;
          spawn({ tex: textures.glow, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * .8, vx: -Math.cos(a) * r * 2.4, vy: -Math.sin(a) * r * 2,
            drag: .97, life: 420, s0: .1 * u, s1: .3 * u, a0: .2, a1: 1, tint: pick(FIRE), add: true });
        }
        spawn({ tex: textures.glow, x: cx + rand(-14, 14) * u, y: cy + point.size * .3, vy: rand(-220, -140) * u, life: 600, s0: .4 * u, s1: .05, a0: .9, a1: 0, tint: pick(FIRE), add: true });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    fireBurst(point, n = 46) {
      if (!point) return;
      const u = unit(point);
      for (let i = 0; i < many(n); i++) {
        const a = rand(0, Math.PI * 2), v = rand(110, 460) * u;
        spawn({ tex: textures?.glow, x: point.x, y: point.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .6 - 160 * u, g: -240, drag: .9, life: rand(380, 880),
          s0: rand(.4, .8) * u, s1: rand(.05, .2) * u, a0: 1, a1: 0, tint: pick(FIRE), add: true });
      }
      for (let i = 0; i < many(10); i++) {
        spawn({ tex: textures?.soft, x: point.x + rand(-26, 26) * u, y: point.y + rand(-26, 8) * u, vx: rand(-50, 50), vy: rand(-130, -50) * u, drag: .96, life: rand(900, 1400),
          s0: .45 * u, s1: 1.2 * u, a0: .5, a1: 0, tint: pick([0x5a4a40, 0x6b5a4c, 0x3d332c]), delay: rand(80, 220) });
      }
    },
    // Estrellas del color de la carta sobre la ficha afectada.
    cardHit(point, tint) {
      if (!point) return;
      const u = unit(point);
      for (let i = 0; i < many(14); i++) {
        const a = rand(0, Math.PI * 2);
        spawn({ tex: textures?.star, x: point.x, y: point.y, vx: Math.cos(a) * 220 * u, vy: Math.sin(a) * 220 * u - 80, g: 300, drag: .9,
          life: 600, s0: .4 * u, s1: .05, a0: 1, a1: 0, tint, add: true, vr: 6 });
      }
      api.flare(point, 1.5, tint, 300);
    },
    trail(point, tint) {
      if (!point) return;
      spawn({ tex: textures?.glow, x: point.x, y: point.y, life: 320, s0: .45 * unit(point), s1: .05, a0: .8, a1: 0, tint, add: true });
    },
  };
  window.RealesIdealesCombatFX = api;
})();
