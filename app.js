'use strict';

const rules = window.RealesIdeales;
const ai = window.RealesIdealesAI;
const byId = id => document.getElementById(id);
const board = byId('board');
const actions = byId('actions');
const dialog = byId('decision');
const hexButtons = new Map();
const animals = {
  mono: 'Mono', llama: 'Llama', gallo: 'Gallo', guacamayo: 'Guacamayo',
  tigrillo: 'Tigrillo', cuy: 'Cuy', rana: 'Rana', gato: 'Gato',
};
const tokenFaction = { I: 'idealista', R: 'realista' };
const cardTypes = {
  boost: 'Táctica',
  weaken: 'Control',
  major: 'Táctica',
  decisive: 'Ataque',
  cannon: 'Invocación',
  search: 'Exploración',
};
const newAsset = filename => 'assets/v014/' + filename;

let game = null;
let mode = null;
let progressTimer = null;
let selection = null;
let pending = null;
let drag = null;
let suppressClick = false;
let battleResult = null;
let duel = null;
let combatIntro = false;
let started = null;
let ended = null;
let bannerTimer = null;
let bannerQueue = [];
let bannerShowing = false;
let announcedEvents = 0;
const searchDialog = byId('search-choice');
const rescueDialog = byId('rescue-dialog');
const controls = actions.closest('.controls');
// === Ajustes del jugador (se guardan en este navegador) ===
const SETTINGS_KEY = 'reales-ideales-ajustes';
const settings = { timer: 'normal', speed: 1, board: 'andes' };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* sin almacenamiento */ }
settings.speed = Number(settings.speed) || 1;
const saveSettings = () => {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* sin almacenamiento */ }
};

function span(parent, className, text) {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}
function button(parent, label, action, className) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = label;
  node.addEventListener('click', action);
  parent.append(node);
  return node;
}
function say(title, text) {
  byId('phase-title').textContent = title;
  byId('instructions').textContent = text;
}
function confirmAction(title, text, label, callback, card = null) {
  if (dialog.open) return;
  byId('decision-title').textContent = title;
  byId('decision-text').textContent = text;
  const confirm = byId('confirm');
  confirm.textContent = label;
  confirm.dataset.action = label;
  const preview = byId('decision-card');
  preview.hidden = !card;
  preview.replaceChildren();
  if (card) {
    renderCardFace(preview, card, true);
  }
  pending = callback;
  dialog.showModal();
}
byId('cancel').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  if (!dialog.open) {
    pending = null;
    scheduleProgress();
  }
});
byId('confirm').addEventListener('click', () => {
  const callback = pending;
  pending = null;
  dialog.close();
  callback?.();
});
byId('search-cancel').addEventListener('click', () => searchDialog.close());

function bannerFromEvent(event) {
  switch (event.type) {
    case 'turn': return { kind: event.side, title: mode === 'ai' ? (event.side === 'I' ? 'TU TURNO' : 'TURNO DEL RIVAL') : 'TURNO ' + rules.SIDE[event.side].toUpperCase(), subtitle: 'Prepara tu movimiento o ataque' };
    case 'move': return null; // El desplazamiento y su sonido ya comunican la acción.
    case 'special': return { kind: 'special', title: event.power.toUpperCase(),
      subtitle: nameOf(event.piece) + ': ' + rules.FIRE_POWER.description };
    case 'attack': return event.special ? null : {
      kind: 'attack', title: mode === 'ai' && event.side === 'R' ? '¡TE DECLARAN ATAQUE!' : '¡ATAQUE DECLARADO!',
      subtitle: 'Fase de ataque: prepara tus cartas'
    };
    case 'combo-card': return { kind: 'combo', title: '¡COMBO! +1', subtitle: 'Dos cartas iguales activadas' };
    case 'combo-ready': return { kind: 'combo', title: '¡COMBO DECISIVO!', subtitle: 'Selecciona una segunda ficha enemiga' };
    case 'combo': return { kind: 'combo', title: '¡DOBLE ELIMINACIÓN!', subtitle: 'Una segunda ficha cae ante el combo decisivo' };
    case 'double-ready': return { kind: 'combo', title: '¡DOBLE IMPACTO!', subtitle: 'Elige otra ficha enemiga vecina' };
    case 'double': return { kind: 'combo', title: '¡DOBLE IMPACTO!', subtitle: 'Una segunda ficha cae' };
    case 'summon': return { kind: 'summon', title: '¡CAÑÓN INVOCADO!', subtitle: event.piece + ' es cañón: +2 en este combate y al atacar' };
    case 'rescue': return { kind: 'rescue', title: '¡FICHA RESCATADA!', subtitle: 'Regresa al campo de batalla' };
    case 'draw': return { kind: 'draw', title: 'ROBO DE CARTAS', subtitle: rules.SIDE[event.side] + ': ' + event.count + ' carta(s)' };
    case 'end': return null;
    default: return null;
  }
}
function showNextBanner() {
  clearTimeout(bannerTimer);
  if (!game || !bannerQueue.length) {
    byId('phase-banner').hidden = true;
    bannerShowing = false;
    document.body.classList.remove('banner-on');
    if (game) {
      finishCombatIntro();
      maybeShowEnd();
    }
    scheduleProgress();
    return;
  }
  const next = bannerQueue.shift();
  const node = byId('phase-banner');
  node.dataset.kind = next.kind;
  byId('banner-title').textContent = next.title;
  byId('banner-subtitle').textContent = next.subtitle;
  node.hidden = false;
  bannerShowing = true;
  document.body.classList.add('banner-on');
  bannerTimer = setTimeout(() => {
    node.hidden = true;
    bannerShowing = false;
    showNextBanner();
  }, (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 500 : 1350) / settings.speed);
}
function announceNewEvents() {
  const newEvents = game.events.slice(announcedEvents);
  announcedEvents = game.events.length;
  for (const event of newEvents) {
    const banner = bannerFromEvent(event);
    if (banner) bannerQueue.push(banner);
    if (event.type === 'turn' && game.players[event.side].charge >= rules.CHARGE_MAX
        && !(mode === 'ai' && event.side === 'R'))
      bannerQueue.push({ kind: 'special', title: '¡FUEGO ESPECIAL LISTO!',
        subtitle: 'Toca una ficha con fuego y pulsa el icono de fuego' });
  }
  // Primero la animación, después el banner: como en los juegos de artillería.
  const duration = playEffects(newEvents);
  if (duration > 0) {
    fxBusy = true;
    document.body.classList.add('fx-busy');
    clearTimeout(fxBusyTimer);
    fxBusyTimer = setTimeout(releaseEffects, duration / settings.speed);
  } else if (!fxBusy && !bannerShowing && bannerQueue.length) showNextBanner();
}
function releaseEffects() {
  fxBusy = false;
  fxBusyTimer = null;
  document.body.classList.remove('fx-busy');
  if (!game) return;
  syncCounters();
  maybeShowEnd();
  if (duelHold) {
    duelHold = false;
    renderDuel();
  }
  if (!bannerShowing && bannerQueue.length) showNextBanner();
  else if (!bannerShowing) { finishCombatIntro(); scheduleProgress(); }
}
function finishCombatIntro() {
  if (!combatIntro || fxBusy || bannerShowing || bannerQueue.length) return;
  combatIntro = false;
  document.body.classList.remove('combat-intro');
  if (game?.phase === 'reveal') { renderDuel(); syncTimer(); layoutScene(); }
}
// La partida espera mientras se muestran efectos o una opción del menú.
function busy() {
  return fxBusy || bannerShowing || matchDialogs.some(node => node.open);
}

// === Efectos visuales y sonoros ===
// Se derivan solo de los eventos del motor; la acción sigue explicada por
// banners, registro y resultado aunque la animación esté desactivada.
const fx = window.RealesIdealesFX;
const fxLayer = byId('fx-layer');
const cardColors = {
  boost: ['#62c46a', '#f7ffd9'], weaken: ['#7b4bb0', '#e6d4ff'], major: ['#f0b52e', '#fff3c4'],
  decisive: ['#d8312a', '#fff0e6'], cannon: ['#a0703c', '#ffd9a0'], search: ['#2c9fa4', '#d8fffb'],
};
// Emblemas de plastilina de Sites; Exploración usa su símbolo textual.
const fxEmblems = new Set(['boost', 'weaken', 'major', 'decisive', 'cannon']);
const fxSymbols = { boost: '+1', weaken: '−1', major: '+2', decisive: '✦', cannon: '+1', search: '⌕' };
let fxTimers = [];
let fxBusy = false;
let fxBusyTimer = null;
let lastCells = new Map();
// Fichas cuyo dibujo real se oculta mientras su réplica animada recorre el tablero.
const fxHidden = new Set();
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function later(ms, callback) {
  const timer = setTimeout(() => {
    fxTimers = fxTimers.filter(value => value !== timer);
    callback();
  }, ms / settings.speed);
  fxTimers.push(timer);
}
// Velocidad rápida: todas las animaciones CSS de la capa de efectos se aceleran.
new MutationObserver(records => {
  if (settings.speed === 1) return;
  for (const record of records) for (const node of record.addedNodes)
    node.getAnimations?.({ subtree: true }).forEach(animation => { animation.playbackRate = settings.speed; });
}).observe(fxLayer, { childList: true, subtree: true });
function clearEffects() {
  fxTimers.forEach(clearTimeout);
  fxTimers = [];
  clearTimeout(fxBusyTimer);
  fxBusyTimer = null;
  fxBusy = false;
  document.body.classList.remove('fx-busy');
  fxHidden.clear();
  fxLayer.replaceChildren();
  lastCells = new Map();
  document.querySelector('.field')?.classList.remove('fx-shake', 'fx-shake-strong');
}
// Centro de una casilla en pantalla: mismo sistema de referencia que el video del escenario.
function cellPoint(cell) {
  const geometry = sceneGeometry?.cells[cell];
  const rect = board.getBoundingClientRect();
  if (!geometry || !rect.width) return null;
  const scale = rect.width / sceneGeometry.width;
  return { x: rect.left + geometry.x * scale, y: rect.top + geometry.y * scale, size: geometry.w * scale };
}
let fxCells = new Map();
function pieceCell(id) {
  return fxCells.get(id) ?? null;
}
function centerPoint() {
  const duelNode = byId('duel');
  const rect = (duelNode.hidden ? board : duelNode).getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: Math.min(rect.width, 120) };
}
function spawn(className, point, vars = {}, life = 1300) {
  if (!point) return null;
  const node = document.createElement('span');
  node.className = 'fx ' + className;
  node.style.left = point.x + 'px';
  node.style.top = point.y + 'px';
  node.style.setProperty('--size', point.size + 'px');
  for (const [key, value] of Object.entries(vars)) node.style.setProperty('--' + key, value);
  fxLayer.append(node);
  setTimeout(() => node.remove(), life / settings.speed);
  return node;
}
function flash(color, glow) {
  spawn('fx-flash', { x: 0, y: 0, size: 0 }, { color, glow }, 900);
}
function shake(strong = false) {
  if (reducedMotion()) return;
  const field = document.querySelector('.field');
  field.classList.remove('fx-shake', 'fx-shake-strong');
  void field.offsetWidth;
  field.classList.add(strong ? 'fx-shake-strong' : 'fx-shake');
  later(650, () => field.classList.remove('fx-shake', 'fx-shake-strong'));
}
// Globo de diálogo junto a una ficha, como los gritos de los vehículos.
function speech(cell, text, side, life = 1100) {
  const point = cellPoint(cell);
  if (!point) return;
  const right = point.x < window.innerWidth - 150;
  const bubble = spawn('fx-bubble ' + (right ? 'to-right' : 'to-left') + ' side-' + side,
    { x: point.x + (right ? 1 : -1) * point.size * .12, y: point.y - point.size * .3, size: 0 }, {}, life);
  if (bubble) bubble.textContent = text;
}
function tokenRect(id, cell) {
  const rect = board.querySelector('[data-piece="' + id + '"]')?.getBoundingClientRect();
  if (rect?.width) return rect;
  const point = cellPoint(cell);
  return point && { width: point.size * TOKEN_SCALE, height: point.size * TOKEN_SCALE };
}
function hideToken(id) {
  fxHidden.add(id);
  board.querySelector('[data-piece="' + id + '"]')?.classList.add('fx-pending');
}
function showToken(id) {
  fxHidden.delete(id);
  board.querySelector('[data-piece="' + id + '"]')?.classList.remove('fx-pending');
}
// Réplica de una ficha sobre la capa de efectos (vehículo o resto antes de explotar).
function tokenClone(piece, point, rect, className, life) {
  const node = spawn(className, { ...point, size: 0 }, { w: rect.width + 'px', h: rect.height + 'px' }, life);
  if (node) node.append(makeToken(piece));
  return node;
}
const DRIVE_MS = 900;
// Desplazamiento tipo camioncito: avanza a tumbos, levanta polvo y suena el motor.
function drive(event) {
  const piece = rules.piece(game, event.piece);
  const from = cellPoint(event.from), to = cellPoint(event.to);
  const rect = tokenRect(event.piece, event.to);
  if (!piece || !from || !to || !rect) return;
  fx.play('drive', DRIVE_MS / 1000);
  if (reducedMotion()) {
    spawn('fx-dust', to, {}, 700);
  } else {
    const vehicle = tokenClone(piece, from, rect, 'fx-vehicle', DRIVE_MS + 60);
    if (vehicle) {
      vehicle.style.setProperty('--dx', (to.x - from.x) + 'px');
      vehicle.style.setProperty('--dy', (to.y - from.y) + 'px');
      vehicle.style.setProperty('--tilt', (to.x >= from.x ? 5 : -5) + 'deg');
    }
    for (let i = 0; i < 4; i++) later(i * DRIVE_MS / 4, () => {
      const t = i / 4;
      spawn('fx-dust small', { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t + rect.height * .35, size: rect.width * .5 }, {}, 650);
    });
  }
  later(DRIVE_MS, () => {
    showToken(event.piece);
    fx.play('ok');
    speech(event.to, '¡Ok!', piece.side, 950);
  });
}
function explodeAt(cell, big = false) {
  const point = cellPoint(cell);
  spawn('fx-explosion' + (big ? ' big' : ''), point, {}, 1200);
  spawn('fx-shockwave', point, {}, 900);
  if (!reducedMotion()) for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.random() * .4;
    const reach = (point?.size ?? 60) * (0.8 + Math.random() * 0.6);
    spawn('fx-debris', point, { dx: Math.cos(angle) * reach + 'px', dy: Math.sin(angle) * reach + 'px' }, 900);
  }
}
const SHOT_DELAY = 650, SHOT_FLIGHT = 720;
// Ataque especial: la pantalla se oscurece, la ficha queda destacada,
// las partículas del poder se concentran en ella y aparece el nombre y lo que hace.
const SPECIAL_MS = 2300;
const powerStyles = {
  tigrillo: { color: '#ffe066', glow: '#5ac8ff', shape: 'spark' },
  llama: { color: '#d8b48a', glow: '#ffdca0', shape: 'rock' },
  guacamayo: { color: '#ff8a2a', glow: '#ffd34d', shape: 'ember' },
  rana: { color: '#8dffb8', glow: '#36e0ff', shape: 'spark' },
  gallo: { color: '#ff5a2a', glow: '#ffd34d', shape: 'ember' },
  mono: { color: '#ffd34d', glow: '#ff8a2a', shape: 'ember' },
  cuy: { color: '#c08aff', glow: '#5ac8ff', shape: 'ring' },
  gato: { color: '#a07ad8', glow: '#2c1a3a', shape: 'smoke' },
};
function specialCall(event) {
  const point = cellPoint(pieceCell(event.piece));
  const piece = rules.piece(game, event.piece);
  const power = rules.FIRE_POWER;
  const style = powerStyles[event.animal] ?? powerStyles.tigrillo;
  fx.play('special');
  if (point) {
    spawn('fx-spotlight', { x: 0, y: 0, size: 0 }, { x: point.x + 'px', y: point.y + 'px', r: point.size * .7 + 'px' }, SPECIAL_MS);
    spawn('fx-power-aura side-' + event.side, point, { color: style.color, glow: style.glow }, SPECIAL_MS);
    if (piece) tokenClone(piece, point, { width: point.size * .95, height: point.size * .95 }, 'fx-hero', SPECIAL_MS);
    if (!reducedMotion()) for (let i = 0; i < 26; i++) {
      const angle = Math.random() * Math.PI * 2;
      const reach = point.size * (1.2 + Math.random() * 1.6);
      spawn('fx-particle shape-' + style.shape, point, {
        dx: Math.cos(angle) * reach + 'px', dy: Math.sin(angle) * reach + 'px',
        delay: Math.round(Math.random() * 700) + 'ms', color: style.color, glow: style.glow,
      }, SPECIAL_MS);
    }
  }
  const title = spawn('fx-power-name side-' + event.side, { x: window.innerWidth / 2, y: window.innerHeight * .26, size: 0 },
    { color: style.color, glow: style.glow }, SPECIAL_MS);
  if (title) {
    span(title, 'fx-power-title', event.power);
    span(title, 'fx-power-desc', animals[event.animal] + ': ' + power.description);
  }
  later(SPECIAL_MS * .55, () => { if (!reducedMotion()) shake(); });
}
function attackSequence(event) {
  const fromCell = pieceCell(event.piece), toCell = pieceCell(event.target);
  speech(fromCell, event.special ? '¡' + rules.SPECIALS[event.special].name + '!' : '¡Al ataque!', event.side, 1200);
  fx.play('charge');
  later(SHOT_DELAY, () => fireShell(fromCell, toCell, event.side));
}
function fireShell(fromCell, toCell, side) {
  const from = cellPoint(fromCell), to = cellPoint(toCell);
  launchShell(from, to, side);
}
function launchShell(from, to, side) {
  if (!from || !to) return;
  fx.play('launch');
  spawn('fx-muzzle', from, {}, 500);
  if (reducedMotion()) {
    spawn('fx-lock', to, {}, 1400);
    return;
  }
  const dx = to.x - from.x, dy = to.y - from.y;
  const arc = Math.max(70, Math.hypot(dx, dy) * 0.55);
  const shell = spawn('fx-shell-x', from, { dx: dx + 'px' }, 900);
  const inner = document.createElement('span');
  inner.className = 'fx-shell side-' + side;
  inner.style.setProperty('--dy', dy + 'px');
  inner.style.setProperty('--peak', (dy / 2 - arc) + 'px');
  shell.append(inner);
  later(SHOT_FLIGHT, () => {
    spawn('fx-impact', to, {}, 700);
    spawn('fx-lock', to, {}, 1400);
    fx.play('explosion');
    shake();
  });
}
// Cada activación o pase entra directamente en su espacio, sin ventana central.
const SHOWCASE_MS = 850;
function showcase(event) {
  if (!duel) return;
  if (event.type === 'pass') {
    const slot = duelSlots[event.side].length;
    duelSlots[event.side].push(null);
    renderDuel({ side: event.side, slot });
    fx.play('pass');
    return;
  }
  applyCardForce(event.side, event.card);
  fx.play(event.card);
}
// Suma la carta al marcador del duelo y hace volar el número ganado o perdido.
function floatNumber(side, text, kind) {
  const target = byId('duel').querySelector('[data-force="' + side + '"]');
  const rect = target?.getBoundingClientRect();
  const point = rect?.width ? { x: rect.left + rect.width / 2, y: rect.top, size: 0 }
    : { x: window.innerWidth / 2, y: window.innerHeight * .6, size: 0 };
  const node = spawn('fx-number ' + kind, point, {}, 1400);
  if (node) node.textContent = text;
}
function applyCardForce(side, card) {
  if (!duel) return;
  const index = duel[0].side === side ? 0 : 1;
  const rivalSide = duel[1 - index].side;
  const before = [forceOf(0).total, forceOf(1).total];
  const slot = duelSlots[side].length;
  duelSlots[side].push(card);
  duelPlayed[side] = [...duelPlayed[side], card];
  renderDuel({ side, slot });
  const after = [forceOf(0).total, forceOf(1).total];
  const own = after[index] - before[index], rival = after[1 - index] - before[1 - index];
  if (card === 'decisive') floatNumber(side, 'Decisivo', 'decisive');
  else if (own) floatNumber(side, signed(own), 'up');
  if (rival) later(160, () => floatNumber(rivalSide, signed(rival), 'down'));
  for (const [i, delta] of [[index, own], [1 - index, rival]]) {
    if (!delta) continue;
    const value = byId('duel').querySelector('[data-force="' + duel[i].side + '"] .duel-force-value');
    value?.classList.add(delta > 0 ? 'bump-up' : 'bump-down');
  }
}
// Las fichas vencidas siguen a la vista hasta que estalla su casilla.
function keepUntilExplosion(id, delay) {
  const cell = pieceCell(id);
  const piece = rules.piece(game, id);
  const point = cellPoint(cell);
  const rect = point && { width: point.size * .78, height: point.size * .78 };
  if (!piece || !point || delay <= 0) return;
  tokenClone(piece, point, rect, 'fx-remnant', delay + 80);
}
function effectFor(event) {
  switch (event.type) {
    case 'move':
    case 'bonus':
    case 'advance':
      drive(event);
      return;
    case 'leap':
      drive(event);
      return;
    case 'special':
      specialCall(event);
      return;
    case 'attack':
      attackSequence(event);
      return;
    case 'reveal':
    case 'pass':
      showcase(event);
      return;
    case 'combo-card':
    case 'combo-ready':
      fx.play('combo');
      flash('#673b97', '#fff0a0');
      spawn('fx-rays', centerPoint(), {}, 1100);
      return;
    case 'battle': {
      const big = event.decisiveCombo || Math.abs(event.force[0] - event.force[1]) >= 3;
      event.removed.length > 1 ? fx.play('draw') : fx.play('explosion', big);
      // El duelo se retira justo antes de la explosión para no tapar las fichas.
      duelHold = false;
      renderDuel();
      event.removed.forEach((id, i) => later(i * 170, () => explodeAt(pieceCell(id), big)));
      later(event.removed.length * 170 + 250, () => syncCounters(true));
      if (event.winner) flash(event.winner === 'I' ? '#235f82' : '#9d312f', '#ffe3a3');
      shake(big || event.removed.length > 1);
      return;
    }
    case 'double-ready':
      fx.play('combo');
      flash('#9d312f', '#ffe3a3');
      return;
    case 'double':
    case 'combo':
      fx.play('explosion', true);
      explodeAt(pieceCell(event.target), true);
      later(300, () => syncCounters(true));
      shake(true);
      return;
    case 'summon':
      fx.play('summon');
      spawn('fx-summon', cellPoint(event.cell), {}, 1300);
      return;
    case 'rescue':
      fx.play('rescue');
      spawn('fx-rescue', cellPoint(event.to), {}, 1300);
      speech(event.to, '¡Ok!', event.side, 950);
      return;
    case 'draw':
    case 'search':
      fx.play('deal');
      return;
    case 'turn':
      fx.play('turn', event.side);
      return;
    case 'time-cannon': {
      const art = board.getBoundingClientRect();
      const viewport = boardViewport.getBoundingClientRect();
      // Boca del cañón decorativo en el fotograma andino de 720 × 1280.
      const x = art.left + art.width * 507 / 720;
      const y = art.top + art.height * 317 / 1280;
      const visible = board.dataset.theme === 'andes' && y >= viewport.top && y <= viewport.bottom && y >= 0;
      launchShell(visible ? { x, y, size: 40 } : { x: viewport.right - 32, y: viewport.top + 28, size: 40 },
        { x: window.innerWidth / 2, y: window.innerHeight * .46, size: 64 }, 'R');
      return;
    }
    case 'end':
      flash('#f0b52e', '#fff7e6');
      spawn('fx-rays', centerPoint(), {}, 1600);
  }
}
// Duración de cada animación: el siguiente evento y los banners esperan a que termine.
const fxDurations = { move: DRIVE_MS + 800, bonus: DRIVE_MS + 800, advance: DRIVE_MS + 800,
  attack: SHOT_DELAY + SHOT_FLIGHT + 500, reveal: SHOWCASE_MS, pass: 900, 'combo-card': 700,
  'combo-ready': 700, battle: 1100, combo: 1000, double: 1000, 'double-ready': 700, summon: 1100, rescue: 1100,
  'time-cannon': SHOT_FLIGHT + 500, end: 1400, special: SPECIAL_MS, leap: DRIVE_MS + 300 };
function playEffects(events) {
  // Instantánea de casillas: las fichas eliminadas conservan su posición previa.
  const cells = new Map(lastCells);
  for (const p of game.pieces) if (p.cell) cells.set(p.id, p.cell);
  fxCells = cells;
  let delay = 0;
  for (const event of events) {
    if (['move', 'bonus', 'advance'].includes(event.type)) hideToken(event.piece);
    if (event.type === 'battle') event.removed.forEach(id => keepUntilExplosion(id, delay));
    if (event.type === 'combo' || event.type === 'double') keepUntilExplosion(event.target, delay);
    if (event.type === 'leap') {
      hideToken(event.piece);
      // Mientras se anuncia el poder, la ficha sigue en su casilla de origen.
      const point = cellPoint(event.from);
      const piece = rules.piece(game, event.piece);
      if (delay > 0 && point && piece)
        tokenClone(piece, point, { width: point.size * .78, height: point.size * .78 }, 'fx-remnant still', delay + 40);
    }
    if (delay) later(delay, () => { if (game) { fxCells = cells; effectFor(event); } });
    else effectFor(event);
    delay += fxDurations[event.type] ?? 0;
  }
  lastCells = new Map(game.pieces.filter(p => p.cell).map(p => [p.id, p.cell]));
  return delay;
}
const settingsDialog = byId('settings');
const settingsForm = settingsDialog.querySelector('form');
const gameMenu = byId('game-menu');
const helpDialog = byId('help-dialog');
const historyDialog = byId('history');
const matchDialogs = [gameMenu, helpDialog, historyDialog, settingsDialog];
const gameMenuButton = byId('game-menu-button');
const coverHeaderActions = document.querySelector('.header-actions');
const seats = [...document.querySelectorAll('.seat')];
let handOwner = null;
const phaseIndicator = byId('phase-indicator');
gameMenuButton.addEventListener('click', () => gameMenu.showModal());
byId('help-button').addEventListener('click', () => helpDialog.showModal());
byId('match-help').addEventListener('click', () => {
  gameMenu.close();
  helpDialog.showModal();
});
byId('match-history').addEventListener('click', () => {
  gameMenu.close();
  historyDialog.showModal();
});
function syncSettingsForm() {
  const values = { music: fx.musicOn() ? 'on' : 'off', effects: fx.effectsOn() ? 'on' : 'off',
    timer: settings.timer, speed: String(settings.speed), board: settings.board };
  for (const [name, value] of Object.entries(values))
    settingsForm.querySelector('input[name="' + name + '"][value="' + value + '"]').checked = true;
}
function openSettings() {
  syncSettingsForm();
  settingsDialog.showModal();
}
byId('settings-button').addEventListener('click', openSettings);
byId('match-settings').addEventListener('click', () => {
  gameMenu.close();
  openSettings();
});
settingsForm.addEventListener('change', event => {
  const { name, value } = event.target;
  if (name === 'music') fx.setMusic(value === 'on');
  if (name === 'effects') fx.setEffects(value === 'on');
  if (name === 'timer') {
    settings.timer = value;
    timerKey = null;
    if (game) syncTimer();
  }
  if (name === 'speed') settings.speed = Number(value);
  if (name === 'board') {
    settings.board = value;
    applyBoardTheme();
  }
  saveSettings();
});
for (const node of matchDialogs) {
  node.addEventListener('close', () => { if (game) scheduleProgress(); });
}
// La música del menú empieza únicamente con el botón Continuar.
function currentPhase() {
  if (game.phase === 'turn') return 'Movimiento / ataque';
  if (game.phase === 'reveal') return 'Fase de batalla';
  return { combo: 'Combo decisivo', bonus: 'Avance adicional', rescue: 'Rescate',
    end: 'Partida terminada' }[game.phase] ?? 'Preparación';
}

function renderCardFace(parent, card, preview = false) {
  parent.classList.add('illustrated');
  parent.dataset.card = card;
  const title = span(parent, 'card-title', rules.CARDS[card].name);
  const art = span(parent, 'card-art', '');
  art.setAttribute('aria-hidden', 'true');
  span(parent, 'card-type', cardTypes[card]);
  if (preview) {
    parent.setAttribute('aria-label', rules.CARDS[card].name + ': ' + rules.CARDS[card].description);
    span(parent, 'card-effect', rules.CARDS[card].description);
  }
  return title.textContent;
}
function character(piece) {
  return piece.animal ?? rules.ROSTER[piece.side][Number(piece.id.slice(1)) - 1];
}
// Nombres para el jugador: cada bando tiene un animal de cada especie, así que
// "Tigrillo idealista" identifica a la ficha sin códigos como I5 o C6.
const SIDE_ADJECTIVE = { I: 'idealista', R: 'realista' };
function pieceName(piece) {
  const name = animals[character(piece)] + ' ' + SIDE_ADJECTIVE[piece.side];
  return piece.cannon ? 'Cañón (' + name + ')' : name;
}
function nameOf(id) {
  const piece = rules.piece(game, id);
  return piece ? pieceName(piece) : id;
}
// Texto del registro y del resultado sin códigos técnicos; el JSON exportado conserva los originales.
function describe(event, index = game.events.indexOf(event)) {
  switch (event.type) {
    case 'move': return nameOf(event.piece) + ' avanza.';
    case 'bonus':
    case 'advance': return nameOf(event.piece) + ' avanza tras la victoria.';
    case 'leap': return nameOf(event.piece) + ' se acerca con el Fuego Especial.';
    case 'rescue': return rules.SIDE[event.side] + ' rescatan a ' + nameOf(event.piece) + '.';
    case 'rescue-saved': return rules.SIDE[event.side] + ' guardan una estrella de rescate.';
    case 'attack': return nameOf(event.piece) + ' ataca a ' + nameOf(event.target) + '.';
    case 'special': return nameOf(event.piece) + ' lanza ' + event.power + '.';
    case 'summon': return nameOf(event.piece) + ' se convierte en cañón.';
    case 'combo':
    case 'double': return nameOf(event.target) + ' cae como segunda ficha.';
    case 'battle': {
      const attack = game.events.slice(0, index).findLast(e => e.type === 'attack');
      if (!attack) return event.text;
      const score = event.force[0] + ' a ' + event.force[1];
      if (!event.winner) return 'Empate ' + score + ': salen ' + nameOf(attack.piece) + ' y ' + nameOf(attack.target) + '.';
      const [winner, loser] = event.winner === event.attacker ? [attack.piece, attack.target] : [attack.target, attack.piece];
      return nameOf(winner) + ' vence a ' + nameOf(loser) + ' (' + score + ').';
    }
    default: return event.text;
  }
}
function makeToken(piece) {
  const node = document.createElement('span');
  node.className = 'token ' + piece.side + (piece.cannon ? ' cannon' : '');
  node.dataset.piece = piece.id;
  node.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img');
  image.className = 'token-art';
  image.src = piece.cannon ? newAsset('canon.webp')
    : `assets/clay/fichas/${tokenFaction[piece.side]}-${character(piece)}.webp`;
  image.alt = '';
  image.draggable = false;
  node.append(image);
  return node;
}
// Coordinates measured against the 1116 × 1410 board illustration.
const boardColumns = [
  { center: 168, edges: [184, 389, 601, 812, 1014, 1214] },
  { center: 349, edges: [77, 280, 495, 706, 914, 1116, 1324] },
  { center: 538, edges: [175, 389, 601, 812, 1014, 1214] },
  { center: 724, edges: [77, 280, 495, 706, 914, 1116, 1324] },
  { center: 914, edges: [184, 389, 601, 812, 1014, 1214] },
];
const rescueCells = new Set([...rules.STARS.I, ...rules.STARS.R]);
for (const cell of Object.values(rules.CELLS)) {
  const hex = button(board, '', () => { if (!suppressClick) clickCell(cell.id); }, 'hex');
  hex.dataset.cell = cell.id;
  hex.dataset.star = String(rescueCells.has(cell.id));
  hexButtons.set(cell.id, hex);
}
// === Tablero dibujado en SVG ===
// Baldosas de piedra incrustadas en el empedrado de la plaza: sin imagen de fondo
// ni códigos pintados. Usa las mismas medidas que los botones de casilla.
const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attributes = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  parent?.append(node);
  return node;
}
function hexPoints(cx, cy, w, h, scale = 1) {
  const x = w / 2 * scale, q = w / 4 * scale, y = h / 2 * scale;
  return [[cx - x, cy], [cx - q, cy - y], [cx + q, cy - y], [cx + x, cy], [cx + q, cy + y], [cx - q, cy + y]]
    .map(point => point.map(n => n.toFixed(1)).join(',')).join(' ');
}
function starPoints(cx, cy, r) {
  return Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? r * .45 : r;
    return (cx + Math.cos(angle) * radius).toFixed(1) + ',' + (cy + Math.sin(angle) * radius).toFixed(1);
  }).join(' ');
}
function buildBoardArt() {
  const W = 1116, H = 1410, HEX_W = W * .22;
  const art = svg('svg', { class: 'board-art', viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true', focusable: 'false' });
  const defs = svg('defs', {}, art);
  const gradient = (id, top, bottom) => {
    const g = svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svg('stop', { offset: '0', 'stop-color': top }, g);
    svg('stop', { offset: '1', 'stop-color': bottom }, g);
  };
  gradient('tile-I', '#5b9cc2', '#2a6489');
  gradient('tile-R', '#d9705f', '#a23a2f');
  gradient('tile-N', '#f6e0b5', '#d9b27a');
  gradient('rim', '#e2c28f', '#a87a4a');
  const glow = svg('radialGradient', { id: 'tile-light', cx: '.45', cy: '.35', r: '.7' }, defs);
  svg('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '.35' }, glow);
  svg('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': '0' }, glow);
  const grain = svg('pattern', { id: 'clay-grain', patternUnits: 'userSpaceOnUse', width: 260, height: 260 }, defs);
  svg('image', { href: 'assets/clay/relieve.webp', width: 260, height: 260, preserveAspectRatio: 'xMidYMid slice' }, grain);
  const clip = svg('clipPath', { id: 'tiles-clip' }, defs);

  const cells = Object.values(rules.CELLS).map(cell => {
    const { center, edges } = boardColumns[cell.col];
    const rowIndex = Math.floor((cell.row - 1) / 2);
    const top = edges[rowIndex], bottom = edges[rowIndex + 1];
    return { ...cell, cx: center, cy: (top + bottom) / 2, h: bottom - top };
  });
  // Capas: sombra en el suelo, borde de piedra continuo, baldosas, textura, brillo y estrellas.
  const shadow = svg('g', { class: 'board-shadow' }, art);
  const rimDark = svg('g', { class: 'board-rim-dark' }, art);
  const rimLight = svg('g', { class: 'board-rim-light' }, art);
  const tiles = svg('g', { class: 'board-tiles' }, art);
  for (const cell of cells) {
    const points = hexPoints(cell.cx, cell.cy, HEX_W, cell.h);
    svg('polygon', { points: hexPoints(cell.cx, cell.cy + 22, HEX_W, cell.h, 1.04) }, shadow);
    svg('polygon', { points }, rimDark);
    svg('polygon', { points }, rimLight);
    svg('polygon', { points, fill: 'url(#tile-' + cell.zone + ')', class: 'tile tile-' + cell.zone }, tiles);
    svg('polygon', { points }, clip);
  }
  svg('rect', { width: W, height: H, fill: 'url(#clay-grain)', 'clip-path': 'url(#tiles-clip)', class: 'board-grain' }, art);
  const bevel = svg('g', { class: 'board-bevel' }, art);
  for (const cell of cells) {
    svg('polygon', { points: hexPoints(cell.cx, cell.cy, HEX_W, cell.h, .9), fill: 'url(#tile-light)' }, bevel);
    if (rescueCells.has(cell.id))
      svg('polygon', { points: starPoints(cell.cx, cell.cy, cell.h * .26), class: 'board-star' }, bevel);
  }
  // Guirnaldas de plastilina en el borde exterior, como las macetas de la plaza.
  const garlands = svg('g', { class: 'board-garlands' }, art);
  const flower = (x, y, size, rotate = 0) => svg('image', {
    href: 'assets/clay/flor.webp', x: x - size / 2, y: y - size * .4, width: size, height: size * .8,
    transform: 'rotate(' + rotate + ' ' + x + ' ' + y + ')' }, garlands);
  for (const cell of cells) {
    const column = boardColumns[cell.col].edges;
    const rowIndex = Math.floor((cell.row - 1) / 2);
    if (rowIndex === 0) flower(cell.cx, cell.cy - cell.h / 2 - 6, 120);
    if (rowIndex === column.length - 2) flower(cell.cx, cell.cy + cell.h / 2 + 6, 120, 180);
  }
  for (const [x, y, r] of [[40, 520, -90], [40, 900, -90], [1076, 520, 90], [1076, 900, 90]]) flower(x, y, 110, r);
  return art;
}
// === Escenarios del tablero ===
// Cada escenario describe su fotograma (ancho × alto en píxeles) y, para cada casilla
// lógica, el centro y el contorno visibles. En "andes" las medidas salen del video
// con perspectiva (tools/medir_escenario.py); en "plaza", del tablero SVG regular.
// Casillas, fichas y animaciones comparten ese único sistema de referencia.
const TOKEN_SCALE = .66;
const tokenLayer = document.createElement('div');
tokenLayer.className = 'token-layer';
board.append(tokenLayer);
const boardViewport = board.parentElement;
let sceneGeometry = null;
function withBounds(cells) {
  for (const cell of Object.values(cells)) {
    const xs = cell.poly.map(p => p[0]), ys = cell.poly.map(p => p[1]);
    Object.assign(cell, { left: Math.min(...xs), top: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys) });
  }
  return cells;
}
function plazaCells() {
  const cells = {};
  for (const cell of Object.values(rules.CELLS)) {
    const { center, edges } = boardColumns[cell.col];
    const rowIndex = Math.floor((cell.row - 1) / 2);
    const top = edges[rowIndex], bottom = edges[rowIndex + 1], cy = (top + bottom) / 2;
    const w = 1116 * .22, h = bottom - top;
    cells[cell.id] = { x: center, y: cy, poly: [[center - w / 2, cy], [center - w / 4, top], [center + w / 4, top],
      [center + w / 2, cy], [center + w / 4, bottom], [center - w / 4, bottom]] };
  }
  return cells;
}
const scenes = window.RealesIdealesEscenarios ?? {};
const BOARD_THEMES = {
  andes: {
    geometry: () => ({ width: scenes.andes.width, height: scenes.andes.height, crop: 200, cells: withBounds(structuredClone(scenes.andes.cells)) }),
    fullscreen: true,
    art() {
      const video = document.createElement('video');
      video.className = 'board-video';
      video.src = 'assets/escenario/campo-andino.mp4';
      video.poster = 'assets/escenario/campo-andino-poster.webp';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('aria-hidden', 'true');
      video.preload = 'auto';
      // Con animaciones reducidas queda la imagen fija del escenario.
      if (!reducedMotion()) {
        video.autoplay = true;
        video.play?.().catch(() => {});
      }
      return video;
    },
  },
  plaza: {
    geometry: () => ({ width: 1116, height: 1410, crop: 0, cells: withBounds(plazaCells()) }),
    fullscreen: false,
    art: buildBoardArt,
  },
};
// Posición de la ficha: base apoyada un poco por debajo del centro de la casilla,
// tamaño proporcional al ancho visible (las casillas del fondo son más pequeñas).
function placeToken(token, cellId) {
  const g = sceneGeometry.cells[cellId];
  const { width: W, height: H } = sceneGeometry;
  const size = g.w * TOKEN_SCALE;
  token.style.width = size / W * 100 + '%';
  token.style.left = (g.x - size / 2) / W * 100 + '%';
  token.style.top = (g.y + g.h * .2 - size) / H * 100 + '%';
  token.style.zIndex = String(Math.round(g.y));
}
function applyBoardTheme() {
  const name = BOARD_THEMES[settings.board] && (settings.board !== 'andes' || scenes.andes) ? settings.board : 'plaza';
  const theme = BOARD_THEMES[name];
  sceneGeometry = theme.geometry();
  const { width: W, height: H, cells } = sceneGeometry;
  board.dataset.theme = name;
  board.dataset.geometry = 'true';
  document.body.dataset.theme = name;
  board.querySelector('.board-art, .board-video')?.remove();
  board.prepend(theme.art());
  for (const [id, hex] of hexButtons) {
    const g = cells[id];
    hex.style.left = g.left / W * 100 + '%';
    hex.style.top = g.top / H * 100 + '%';
    hex.style.width = g.w / W * 100 + '%';
    hex.style.height = g.h / H * 100 + '%';
    hex.style.clipPath = 'polygon(' + g.poly.map(([x, y]) =>
      ((x - g.left) / g.w * 100).toFixed(2) + '% ' + ((y - g.top) / g.h * 100).toFixed(2) + '%').join(',') + ')';
  }
  layoutScene();
  if (game) renderBoard();
}
// Encaje del escenario: en móvil vertical el video cubre toda la pantalla (como object-fit: cover,
// pero calculado aquí para que la capa interactiva use exactamente la misma escala y recorte).
// En el resto de pantallas, el tablero va en su columna recortando el cielo superior.
const portraitPhone = window.matchMedia('(orientation: portrait) and (max-width: 849px)');
function layoutScene() {
  if (!sceneGeometry) return;
  const { width: W, height: H, crop } = sceneGeometry;
  const full = document.body.classList.contains('playing') && BOARD_THEMES[board.dataset.theme].fullscreen && portraitPhone.matches;
  document.body.classList.toggle('scene-full', full);
  // En pantalla completa el escenario cuelga de <body>, detrás de toda la interfaz;
  // en las demás vistas vuelve a su columna.
  const home = byId('partida').querySelector('.board-stage');
  if (full && boardViewport.parentElement !== document.body) document.body.prepend(boardViewport);
  if (!full && boardViewport.parentElement !== home) home.append(boardViewport);
  if (full) {
    const vw = boardViewport.clientWidth, vh = boardViewport.clientHeight;
    const cells = Object.values(sceneGeometry.cells);
    const left = Math.min(...cells.map(cell => cell.left));
    const right = Math.max(...cells.map(cell => cell.left + cell.w));
    const top = Math.min(...cells.map(cell => Math.min(cell.top, cell.y + cell.h * .2 - cell.w * TOKEN_SCALE)));
    const bottom = Math.max(...cells.map(cell => cell.top + cell.h));
    let hudBottom = Math.max(...seats.map(seat => seat.getBoundingClientRect().bottom));
    const heading = byId('active-side').closest('.field-heading');
    const seatTop = Math.min(...seats.map(seat => seat.getBoundingClientRect().top));
    document.body.style.setProperty('--hud-turn-top', Math.max(0, seatTop) + 'px');
    hudBottom = Math.max(hudBottom, heading.getBoundingClientRect().bottom);
    const hint = byId('special-hint');
    const dockTop = hint.hidden ? controls.getBoundingClientRect().top : Math.min(controls.getBoundingClientRect().top, hint.getBoundingClientRect().top);
    const margin = 8;
    // Mantiene el terreno, las fichas y sus áreas táctiles en el mismo plano.
    const scale = Math.min(Math.max(vw / W, vh / H),
      (vw - margin * 2) / (right - left),
      Math.max(1, dockTop - hudBottom - margin * 2) / (bottom - top));
    const y = Math.max(hudBottom + margin - top * scale, Math.min(vh - H * scale, dockTop - margin - bottom * scale));
    Object.assign(board.style, { left: (vw - (left + right) * scale) / 2 + 'px', top: y + 'px',
      width: W * scale + 'px', height: H * scale + 'px' });
    boardViewport.style.removeProperty('--scene-aspect');
    document.body.style.setProperty('--grid-top', top * scale + y + 'px');
    // Coordenadas del globo respecto al fotograma, con límites para móviles estrechos.
    const clock = byId('match-clock');
    const rect = board.getBoundingClientRect();
    const cx = Math.max(rect.left + rect.width * .71, heading.getBoundingClientRect().right + clock.offsetWidth / 2 + 5);
    const cy = rect.top + rect.height * .205;
    clock.style.setProperty('--clock-x', Math.max(clock.offsetWidth / 2 + 8, Math.min(vw - clock.offsetWidth / 2 - 8, cx)) + 'px');
    clock.style.setProperty('--clock-y', Math.max(heading.getBoundingClientRect().top + 25, Math.min(top * scale + y - 35, cy)) + 'px');
  } else {
    byId('match-clock').style.removeProperty('--clock-x');
    byId('match-clock').style.removeProperty('--clock-y');
    boardViewport.style.setProperty('--scene-aspect', String(W / (H - crop)));
    Object.assign(board.style, { left: '0', width: '100%', top: -crop / (H - crop) * 100 + '%', height: H / (H - crop) * 100 + '%' });
  }
  positionDuel();
}
window.addEventListener('resize', layoutScene);
portraitPhone.addEventListener?.('change', layoutScene);
const sceneResize = new ResizeObserver(() => {
  if (document.body.classList.contains('scene-full')) layoutScene();
});
sceneResize.observe(controls);
sceneResize.observe(phaseIndicator);
// El escenario se prepara durante la pantalla de carga inicial.
function isAITurn() {
  return mode === 'ai' && ai.decisionSide(game, rules) === 'R';
}
function selectable(id) {
  return rules.moves(game, id).length > 0 || rules.attacks(game, id).length > 0 || rules.specialOptions(game, id).length > 0;
}
// Fuego Especial: objetivo cercano o aproximación de una casilla.
let specialMode = false;
let specialAt = null;
function specialView() {
  if (!specialMode || !selection) return null;
  const piece = rules.piece(game, selection);
  const options = rules.specialOptions(game, selection);
  const at = specialAt ?? piece.cell;
  return {
    targets: [...new Set(options.filter(o => !specialAt || o.at === at).map(o => o.target))],
    destinations: specialAt ? [] : [...new Set(options.filter(o => o.at !== piece.cell).map(o => o.at))],
    at,
  };
}
function clearSpecial() {
  specialMode = false;
  specialAt = null;
}
function startSpecial(attacker, defender, at) {
  if (!rules.specialAttack(game, attacker.id, defender.id, at)) return;
  combatIntro = true;
  document.body.classList.add('combat-intro');
  battleResult = null;
  // El duelo muestra la ficha tal como empieza el combate (ya en su casilla de ataque).
  duel = [{ ...attacker }, { ...rules.piece(game, defender.id) }];
  duelPlayed = { I: [], R: [] };
  duelSlots = { I: [], R: [] };
  duelSpecial = game.battle.special;
  duelHold = false;
  selection = null;
  clearSpecial();
  render();
}
function proposeDestination(id, cell) {
  if (!game || isAITurn() || busy() || dialog.open || searchDialog.open) return false;
  const actor = rules.piece(game, id);
  if (rules.moves(game, id).includes(cell)) {
    if (!rules.move(game, id, cell)) return false;
    selection = null;
    clearSpecial();
    render();
    return true;
  }
  const target = rules.occupant(game, cell);
  if (target && rules.attacks(game, id).includes(target.id)) {
    startAttack(actor, target);
    return true;
  }
  return false;
}
function startAttack(attacker, defender) {
  if (!rules.attack(game, attacker.id, defender.id)) return;
  combatIntro = true;
  document.body.classList.add('combat-intro');
  battleResult = null;
  duel = [{ ...attacker }, { ...defender }];
  duelPlayed = { I: [], R: [] };
  duelSlots = { I: [], R: [] };
  duelSpecial = null;
  duelHold = false;
  selection = null;
  clearSpecial();
  render();
}
function clickCell(cell) {
  if (!game || isAITurn() || busy() || dialog.open || searchDialog.open) return;
  const piece = rules.occupant(game, cell);
  if (game.phase === 'combo' && piece && rules.comboTargets(game).includes(piece.id)) {
    const title = game.battle.combo.kind === 'double' ? '¡Doble Impacto!' : '¡Combo decisivo!';
    confirmAction(title, '¿Eliminar también a ' + pieceName(piece) + '?', 'Eliminar', () => {
      rules.comboEliminate(game, piece.id);
      render();
    });
    return;
  }
  const special = specialView();
  if (special) {
    const attacker = rules.piece(game, selection);
    if (special.destinations.includes(cell)) {
      specialAt = cell;
    } else if (piece && special.targets.includes(piece.id)) {
      const options = rules.specialOptions(game, attacker.id).filter(o => o.target === piece.id);
      const chosen = specialAt ? options.find(o => o.at === specialAt) : options[0];
      if (chosen) startSpecial(attacker, piece, chosen.at);
      return;
    } else if (specialAt) {
      specialAt = null;
    } else {
      clearSpecial();
      selection = null;
    }
    render();
    return;
  }
  if (game.phase === 'rescue' && selection && !piece) {
    if (rules.rescue(game, selection, cell)) selection = null;
  } else if (game.phase === 'turn' || game.phase === 'bonus') {
    if (selection && proposeDestination(selection, cell)) return;
    if (piece && selectable(piece.id)) selection = selection === piece.id ? null : piece.id;
    else selection = null;
    clearSpecial();
  }
  render();
}
function specialReadyPieces() {
  if (game.phase !== 'turn' || isAITurn() || specialMode || game.attacked || game.actions >= 2) return new Set();
  if (game.players[game.turn].charge < rules.CHARGE_MAX) return new Set();
  return new Set(game.pieces.filter(p => p.side === game.turn && p.cell && rules.specialOptions(game, p.id).length).map(p => p.id));
}
function renderBoard() {
  const tokens = [];
  const ready = specialReadyPieces();
  const special = specialView();
  const moves = special ? special.destinations : selection ? rules.moves(game, selection) : [];
  const targets = special ? special.targets : selection ? rules.attacks(game, selection) : [];
  for (const [cell, hex] of hexButtons) {
    const piece = rules.occupant(game, cell);
    const star = rescueCells.has(cell);
    let target = moves.includes(cell) ? 'move' : targets.includes(piece?.id) ? 'target' : '';
    if (game.phase === 'rescue' && selection && !piece && rules.rescueTargets(game).includes(cell)) target = 'move';
    if (special && cell === special.at && specialAt) target = 'origin';
    if (special && piece?.id === selection) hex.dataset.power = 'true';
    else delete hex.dataset.power;
    if (game.phase === 'combo' && piece && rules.comboTargets(game).includes(piece.id)) target = 'target';
    hex.dataset.highlight = target;
    hex.setAttribute('aria-pressed', String(Boolean(piece && piece.id === selection)));
    hex.setAttribute('aria-label', [cell, star ? 'estrella de rescate' : '', piece
      ? rules.SIDE[piece.side] + ' · ' + pieceName(piece) : 'libre',
      target === 'target' ? 'objetivo de ataque' : target === 'move' ? 'movimiento disponible' : ''].filter(Boolean).join(', '));
    if (piece) {
      const token = makeToken(piece);
      if (drag?.ghost && drag.id === piece.id) token.classList.add('origin');
      if (fxHidden.has(piece.id)) token.classList.add('fx-pending');
      if (ready.has(piece.id)) token.classList.add('ss-glow');
      // La ficha refleja el estado de su casilla (selección, objetivo, estrella).
      token.dataset.highlight = target;
      token.dataset.selected = String(piece.id === selection);
      token.dataset.star = String(star);
      if (star) span(token, 'token-star', '');
      if (hex.dataset.power) token.dataset.power = 'true';
      placeToken(token, cell);
      tokens.push(token);
    }
  }
  tokenLayer.replaceChildren(...tokens);
}
board.addEventListener('pointerdown', event => {
  suppressClick = false;
  if (!game || isAITurn() || specialMode || dialog.open || searchDialog.open || busy() || !event.isPrimary || event.button !== 0) return;
  const cell = event.target.closest('[data-cell]')?.dataset.cell;
  const piece = cell && rules.occupant(game, cell);
  if (!piece || !selectable(piece.id)) return;
  drag = { id: piece.id, pointer: event.pointerId, x: event.clientX, y: event.clientY, ghost: null };
});
board.addEventListener('pointermove', event => {
  if (drag?.pointer !== event.pointerId) return;
  if (!drag.ghost) {
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8) return;
    board.setPointerCapture(event.pointerId);
    drag.ghost = makeToken(rules.piece(game, drag.id));
    drag.ghost.classList.add('drag-token');
    document.body.append(drag.ghost);
    selection = drag.id;
    render();
  }
  drag.ghost.style.left = event.clientX + 'px';
  drag.ghost.style.top = event.clientY + 'px';
});
function stopDrag(event, cancelled = false) {
  if (drag?.pointer !== event.pointerId) return;
  const { id, ghost } = drag;
  drag = null;
  if (!ghost) return;
  ghost.remove();
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-cell]')?.dataset.cell;
  renderBoard();
  if (!cancelled && cell) proposeDestination(id, cell);
}
board.addEventListener('pointerup', stopDrag);
board.addEventListener('pointercancel', event => stopDrag(event, true));
board.addEventListener('pointerleave', () => { if (drag && !drag.ghost) drag = null; });

function play(index = null, searchTarget = null) {
  if (!rules.reveal(game, index, searchTarget)) return;
  if (game.phase !== 'reveal') battleResult = game.events.findLast(event => event.type === 'battle');
  render();
}
function chooseSearch(index) {
  const side = rules.actor(game);
  const options = rules.searchOptions(game, side);
  if (!options.length) {
    play(index);
    return;
  }
  const choices = byId('search-options');
  choices.replaceChildren();
  for (const card of options) {
    const copies = game.players[side].deck.filter(value => value === card).length
      - game.battle.search[side].filter(value => value.card === card).length;
    const option = button(choices, '', () => {
      searchDialog.close();
      play(index, card);
    }, 'search-option');
    option.setAttribute('aria-label', rules.CARDS[card].name + ', ' + copies + ' en el mazo');
    const face = span(option, 'card front search-face', '');
    renderCardFace(face, card);
    span(option, 'search-name', rules.CARDS[card].name);
    span(option, 'search-count', copies + ' en el mazo');
  }
  searchDialog.showModal();
}
// El anillo muestra la carga aunque el especial aún no esté disponible.
const specialFire = byId('special-fire');
function renderSpecialFire() {
  const side = game.turn;
  const show = game.phase === 'turn' && !isAITurn() && !game.attacked && game.actions < 2
    && game.players[side].charge >= rules.CHARGE_MAX
    && game.pieces.some(p => p.side === side && rules.specialOptions(game, p.id).length);
  const charge = game.players[handSide() ?? side].charge;
  specialFire.disabled = !show;
  [...specialFire.querySelectorAll('.ss-ring circle')].forEach((segment, index) => {
    segment.classList.toggle('charged', index < charge);
  });
  specialFire.setAttribute('aria-label', 'Carga del fuego: ' + charge + ' de ' + rules.CHARGE_MAX);
  specialFire.setAttribute('aria-pressed', String(show && specialMode));
  document.body.classList.toggle('ss-ready', show);
  const hint = byId('special-hint');
  hint.hidden = !show;
  if (!show) {
    specialFire.classList.remove('armed', 'active');
    return;
  }
  const options = selection ? rules.specialOptions(game, selection) : [];
  const power = options.length ? rules.FIRE_POWER : null;
  // La guía cambia con la ficha y el objetivo seleccionados.
  hint.dataset.step = specialMode ? 'target' : power ? 'press' : 'piece';
  hint.textContent = specialMode
    ? (specialView()?.destinations.length && !specialAt ? 'Elige una casilla verde o un objetivo rojo' : 'Toca el objetivo rojo')
    : power ? 'Activa el fuego' : 'Elige una ficha con fuego';
  specialFire.dataset.side = side;
  specialFire.classList.toggle('armed', Boolean(power));
  specialFire.classList.toggle('active', specialMode);
  specialFire.setAttribute('aria-pressed', String(specialMode));
  specialFire.setAttribute('aria-label', specialMode ? 'Cancelar ' + power?.name
    : power ? 'Activar Fuego Especial: +3 de fuerza' : 'Fuego Especial listo: elige una ficha con enemigo a una o dos casillas');
}
specialFire.addEventListener('click', () => {
  if (!game || busy() || isAITurn()) return;
  const options = selection ? rules.specialOptions(game, selection) : [];
  if (!options.length) {
    fx.play('pass');
    say('Fuego Especial listo', 'Toca una ficha tuya que tenga un enemigo a su alcance y luego este botón.');
    return;
  }
  specialMode = !specialMode;
  specialAt = null;
  fx.play(specialMode ? 'charge' : 'pass');
  render();
});
// Las cartas públicas se muestran únicamente en las cuatro ranuras del combate.
let cardMenu = null;
const cardMenuNode = document.createElement('div');
cardMenuNode.id = 'card-menu';
cardMenuNode.className = 'card-menu';
cardMenuNode.hidden = true;
cardMenuNode.setAttribute('role', 'group');
document.body.append(cardMenuNode);
function closeCardMenu() {
  if (cardMenu === null) return;
  cardMenu = null;
  cardMenuNode.hidden = true;
}
// Un toque fuera del menú y de la carta lo cancela.
document.addEventListener('pointerdown', event => {
  if (cardMenu === null || cardMenuNode.contains(event.target)) return;
  if (byId('hud-hand').querySelector('[data-slot="' + cardMenu.slot + '"]')?.contains(event.target)) return;
  closeCardMenu();
}, true);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeCardMenu(); });
function openCardMenu(node, side, slot, card) {
  cardMenu = { side, slot };
  cardMenuNode.replaceChildren();
  const preview = document.createElement('div');
  preview.className = 'card-menu-preview';
  const art = document.createElement('div');
  art.className = 'card illustrated card-menu-art';
  renderCardFace(art, card);
  preview.append(art);
  const copy = document.createElement('div');
  copy.className = 'card-menu-copy';
  span(copy, 'card-menu-title', rules.CARDS[card].name);
  span(copy, 'card-menu-text', rules.CARDS[card].description);
  preview.append(copy);
  cardMenuNode.append(preview);
  const row = document.createElement('div');
  row.className = 'card-menu-actions';
  cardMenuNode.append(row);
  button(row, 'Cancelar', closeCardMenu, 'secondary');
  const activate = button(row, 'Activar', () => {
    cardMenu = null;
    cardMenuNode.hidden = true;
    if (busy() || game.phase !== 'reveal' || rules.actor(game) !== side || game.players[side].hand[slot] !== card) return;
    card === 'search' ? chooseSearch(slot) : play(slot);
  }, 'primary');
  activate.disabled = game.phase !== 'reveal' || isAITurn() || !rules.playable(game, side, card);
  cardMenuNode.hidden = false;
  const rect = node.getBoundingClientRect();
  const width = cardMenuNode.offsetWidth;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
  cardMenuNode.style.left = left + 'px';
  const above = rect.top - cardMenuNode.offsetHeight - 10;
  cardMenuNode.style.top = Math.max(8, Math.min(above, window.innerHeight - cardMenuNode.offsetHeight - 8)) + 'px';
  cardMenuNode.style.setProperty('--arrow', (rect.left + rect.width / 2 - left) + 'px');
  (activate.disabled ? row.firstElementChild : activate).focus();
}
function handSide() {
  return mode === 'ai' ? 'I' : ai.decisionSide(game, rules);
}
function renderHands() {
  const hand = byId('hud-hand');
  const side = handSide();
  closeCardMenu();
  hand.replaceChildren();
  if (game.phase === 'end' || !side) return;
  if (mode === 'local' && handOwner !== side) {
    button(hand, 'Ver mano de ' + rules.SIDE[side], () => {
      if (busy()) return;
      handOwner = side;
      renderHands();
      if (document.body.classList.contains('scene-full')) layoutScene();
    }, 'secondary hand-handoff');
    return;
  }
  for (const [slot, card] of game.players[side].hand.entries()) {
    const node = button(hand, card ? '' : '—', () => {
      if (busy()) return;
      if (cardMenu?.side === side && cardMenu.slot === slot) closeCardMenu();
      else openCardMenu(node, side, slot, card);
    }, 'hud-card');
    node.dataset.slot = String(slot);
    node.disabled = !card;
    node.title = card ? rules.CARDS[card].name : 'Casilla vacía';
    node.setAttribute('aria-label', node.title);
    if (!card) continue;
    const icon = document.createElement('img');
    icon.src = card === 'search' ? 'assets/clay/dorso-idealista.webp' : 'assets/clay/emblemas/' + card + '.webp';
    icon.alt = '';
    node.append(icon);
  }
}
function nextTurn() {
  selection = null;
  clearSpecial();
  cardMenu = null;
  cardMenuNode.hidden = true;
  // El resultado queda sobre el dock hasta el próximo combate.
  duel = null;
  if (!rules.nextTurn(game)) return; // El banner de inicio del siguiente turno basta.
  render();
}
function renderControls() {
  actions.replaceChildren();
  if (isAITurn()) {
    say('Juega la IA', game.phase === 'reveal' ? 'Los realistas eligen una carta o pasan.' : 'Los realistas preparan su jugada.');
    return;
  }
  switch (game.phase) {
    case 'turn':
      say('Turno de ' + rules.SIDE[game.turn], shouldAutoEndTurn() ? 'Cambia el turno automáticamente.'
        : game.actions === 2 ? 'Dos acciones completadas.'
          : selection ? 'Elige una casilla marcada.'
            : game.moved.length ? 'Movimiento usado. Puedes atacar.'
              : game.attacked ? 'Ataque resuelto. Puedes mover una ficha.'
                : 'Un movimiento y un ataque por turno.');
      const end = button(actions, '', () => {
        if (!busy() && !dialog.open && !searchDialog.open && !isAITurn() && game.phase === 'turn') nextTurn();
      }, 'secondary end-turn');
      end.title = 'Fin de turno';
      end.setAttribute('aria-label', 'Fin de turno');
      end.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h13m-5-5 5 5-5 5M20 5v14"/></svg>';
      if (specialMode && selection) {
        const power = rules.FIRE_POWER;
        say(power.name, power.description + ' ' + (specialView().destinations.length && !specialAt
          ? 'Elige una casilla de destino o un objetivo marcado.' : 'Elige el objetivo marcado.'));
      }
      break;
    case 'reveal': {
      const side = rules.actor(game);
      const role = side === game.battle.defender ? 'Defensa' : 'Ataque';
      say(role + ' · ' + rules.SIDE[side], 'Elige una carta o pasa.');
      button(actions, 'Pasar', () => { if (!busy()) play(); }, 'secondary');
      break;
    }
    case 'combo':
      if (game.battle.combo.kind === 'double') say('¡Doble Impacto!', 'Selecciona una ficha enemiga vecina para eliminarla.');
      else say('¡Combo decisivo!', 'Selecciona en el tablero otra ficha enemiga para eliminarla.');
      button(actions, 'Omitir segunda eliminación', () => {
        rules.comboEliminate(game, null);
        render();
      }, 'secondary');
      break;
    case 'bonus':
      say('Avance de ' + rules.SIDE[game.battle.winner], 'Mueve una ficha propia a una casilla libre vecina.');
      button(actions, 'Omitir avance', () => { selection = null; rules.skipBonus(game); render(); }, 'secondary');
      break;
    case 'rescue':
      say('Rescate', selection ? 'Toca una casilla libre marcada.' : 'Elige una ficha perdida.');
      if (selection) button(actions, 'Guardar', saveRescueChoice, 'secondary');
      break;
    case 'end':
      say(game.winner ? 'Ganan los ' + rules.SIDE[game.winner].toLowerCase() : 'Empate',
        game.timeResult ? 'Se cumplieron los 10 minutos.'
          : game.reason === 'eliminación' ? 'Partida decidida por las últimas fichas.' : 'Se completaron las 12 rondas.');
      break;
  }
}
// Rescate: selección visual, después colocación en el tablero.
function saveRescueChoice() {
  if (!game || game.phase !== 'rescue' || isAITurn()) return;
  if (!rules.rescue(game, null)) return;
  selection = null;
  if (rescueDialog.open) rescueDialog.close();
  render();
}
function showRescuePicker() {
  if (!game || game.phase !== 'rescue' || selection || isAITurn() || busy() ||
      dialog.open || searchDialog.open || rescueDialog.open) return;
  const list = byId('rescue-pieces');
  list.replaceChildren();
  for (const p of game.pieces.filter(p => p.side === game.rescue.side && !p.cell)) {
    const choice = button(list, '', () => {
      if (!game || game.phase !== 'rescue') return;
      selection = p.id;
      rescueDialog.close();
      render();
    }, 'rescue-piece');
    choice.title = pieceName(p);
    choice.setAttribute('aria-label', 'Recuperar ' + pieceName(p));
    choice.append(makeToken({ ...p, cannon: false }));
  }
  rescueDialog.showModal();
}
byId('rescue-save').addEventListener('click',saveRescueChoice);
rescueDialog.addEventListener('cancel',event => { event.preventDefault(); saveRescueChoice(); });
byId('saved-rescue-button').addEventListener('click',() => {
  if (!game || busy() || isAITurn() || dialog.open || searchDialog.open || !rules.startSavedRescue(game)) return;
  selection = null;
  clearSpecial();
  render();
});
function renderSavedRescue() {
  const button = byId('saved-rescue-button');
  const side = game.turn;
  const count = rules.availableSavedRescues(game,side);
  const ready = rules.canUseSavedRescue(game,side) && !isAITurn();
  button.hidden = !ready;
  byId('saved-rescue-count').textContent = count;
  button.setAttribute('aria-label','Usar estrella guardada: ' + count + ' disponibles');
}
// === Fuerza de combate visible ===
// Replica el cálculo de game.js con las cartas ya mostradas en pantalla,
// para que cada jugador vea cuánto suma o le restan antes de decidir.
let duelHold = false;
let duelPlayed = { I: [], R: [] };
let duelSlots = { I: [], R: [] };
let duelSpecial = null;
function forceOf(index) {
  const piece = duel[index], rival = duel[1 - index];
  const own = duelPlayed[piece.side], other = duelPlayed[rival.side];
  const parts = [];
  parts.push({ label: 'Base', value: 0 });
  if (index === 0) {
    if (piece.cannon) parts.push({ label: 'Cañón', value: 2 });
    if (duelSpecial && rules.SPECIALS[duelSpecial].bonus)
      parts.push({ label: rules.SPECIALS[duelSpecial].name, value: rules.SPECIALS[duelSpecial].bonus });
  }
  for (const card of own) if (rules.CARDS[card].own) parts.push({ label: rules.CARDS[card].name, value: rules.CARDS[card].own });
  if (own.length === 2 && own[0] === own[1]) parts.push({ label: 'Combo', value: 1 });
  for (const card of other) if (rules.CARDS[card].rival) parts.push({ label: rules.CARDS[card].name + ' rival', value: rules.CARDS[card].rival });
  const total = Math.max(0, parts.reduce((sum, part) => sum + part.value, 0));
  const decisive = own.filter(card => card === 'decisive').length;
  return { total, parts, decisive };
}
const signed = value => (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(value);
function forceSummary() {
  if (!duel) return null;
  const [a, d] = [forceOf(0), forceOf(1)];
  const decisive = a.decisive - d.decisive;
  return { a, d, decisive };
}
// Recorta el arte aprobado en PNG con esquinas de alfa real, sin alterar la carta.
const playedCardPngs = new Map();
let playedCardAtlas = null;
let playedCardAtlasLoading = false;
const playedCardOrder = ['boost','weaken','major','decisive','cannon','search'];
function preparePlayedCardPngs() {
  if (playedCardAtlasLoading || playedCardPngs.size) return;
  playedCardAtlasLoading = true;
  const img = new Image();
  playedCardAtlas = img;
  img.onload = () => {
    try {
      const w = Math.floor(img.naturalWidth / 3), h = Math.floor(img.naturalHeight / 2);
      for (const [index, card] of playedCardOrder.entries()) {
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        const r = Math.min(w,h) * .075;
        ctx.beginPath();
        ctx.moveTo(r,0); ctx.lineTo(w-r,0); ctx.quadraticCurveTo(w,0,w,r);
        ctx.lineTo(w,h-r); ctx.quadraticCurveTo(w,h,w-r,h);
        ctx.lineTo(r,h); ctx.quadraticCurveTo(0,h,0,h-r);
        ctx.lineTo(0,r); ctx.quadraticCurveTo(0,0,r,0); ctx.closePath(); ctx.clip();
        ctx.drawImage(img,(index%3)*w,Math.floor(index/3)*h,w,h,0,0,w,h);
        playedCardPngs.set(card,canvas.toDataURL('image/png'));
      }
      if (game && duel && !byId('duel').hidden) renderDuel();
    } catch { /* El arte original CSS sigue disponible si canvas falla. */ }
  };
  img.src = 'assets/v014/cartas-aprobadas.webp';
}
function positionDuel() {
  const view = byId('duel');
  if (view.hidden || !sceneGeometry) return;
  const frame = boardViewport.getBoundingClientRect();
  const rect = board.getBoundingClientRect();
  const center = cellPoint('C6');
  if (!frame.width || !rect.width || !center) return;
  const width = Math.min(frame.width - 12, rect.width * .88, 440);
  view.style.width = Math.max(0,width) + 'px';
  view.style.left = (rect.left + rect.width / 2 - frame.left) + 'px';
  const half = view.offsetHeight / 2;
  view.style.top = Math.max(half + 6, Math.min(frame.height - half - 6, center.y - frame.top)) + 'px';
}
function renderDuel(fresh = null) {
  const view = byId('duel');
  view.hidden = !duel || combatIntro || (game.phase !== 'reveal' && !duelHold);
  view.replaceChildren();
  if (view.hidden) return;
  preparePlayedCardPngs();
  const summary = forceSummary();
  for (const side of ['R','I']) {
    const index = duel[0].side === side ? 0 : 1;
    const force = index === 0 ? summary.a : summary.d;
    const group = document.createElement('section');
    group.className = 'played-side';
    group.dataset.side = side;
    group.setAttribute('aria-label', rules.SIDE[side]);
    const row = document.createElement('div');
    row.className = 'played-slots';
    for (let slot = 0; slot < 2; slot++) {
      const decided = slot < duelSlots[side].length;
      const card = duelSlots[side][slot];
      const cell = document.createElement('div');
      cell.className = 'played-slot';
      cell.dataset.state = card ? 'card' : decided ? 'pass' : 'pending';
      if (fresh?.side === side && fresh.slot === slot) cell.classList.add('played-arrival');
      if (card) {
        const rule = rules.CARDS[card];
        cell.setAttribute('aria-label', rule.name + ': ' + rule.description);
        const png = playedCardPngs.get(card);
        if (png) {
          const art = document.createElement('img');
          art.src = png; art.alt = rule.name; art.className = 'played-card-png';
          cell.append(art);
        } else {
          const art = span(cell,'card front played-card-face','');
          renderCardFace(art,card);
        }
        const effect = card === 'decisive' ? 'Decisivo' : rule.rival ? '−1 rival' : signed(rule.own ?? 0);
        span(cell,'played-effect',effect);
      } else {
        span(cell,'played-empty',decided ? 'Sin carta' : 'Por jugar');
      }
      row.append(cell);
    }
    group.append(row);
    const meter = span(group,'played-total duel-force','');
    meter.dataset.force = side;
    span(meter,'duel-force-label','Fuerza');
    span(meter,'duel-force-value',signed(force.total));
    const extras = force.parts.filter(p => p.label === 'Combo' || p.label === 'Cañón' || p.label === rules.FIRE_POWER.name)
      .map(p => p.label + ' ' + signed(p.value));
    if (force.decisive) extras.push(force.decisive === 1 ? 'Decisivo' : 'Doble decisivo');
    if (extras.length) span(group,'played-extras',extras.join(' · '));
    meter.setAttribute('aria-label',rules.SIDE[side] + ': fuerza ' + force.total + (extras.length ? ', ' + extras.join(', ') : ''));
    view.append(group);
  }
  const lead = summary.decisive ? (summary.decisive > 0 ? 0 : 1)
    : summary.a.total === summary.d.total ? -1 : summary.a.total > summary.d.total ? 0 : 1;
  view.dataset.lead = lead === -1 ? 'tie' : duel[lead].side;
  view.setAttribute('aria-label',pieceName(duel[0]) + ' contra ' + pieceName(duel[1]));
  positionDuel();
}
// === Temporizador de decisión ===
// Cuenta solo en las decisiones humanas y se detiene durante animaciones y banners.
const TIMER_SECONDS = { turn: 40, reveal: 20, bonus: 15, combo: 15, rescue: 20 };
let timerKey = null;
let timerLeft = 0;
let timerLast = 0;
let timerTick = -1;
const timerScale = () => settings.timer === 'relaxed' ? 2 : 1;
function timerContext() {
  if (!game || settings.timer === 'off' || !(game.phase in TIMER_SECONDS) || isAITurn()) return null;
  const slot = game.phase === 'reveal' ? game.battle.slot : '';
  return [game.phase, game.turn, game.round, slot].join('|');
}
function syncTimer() {
  const key = timerContext();
  const node = byId('turn-timer');
  node.hidden = !game || game.phase === 'end';
  if (!key) {
    timerKey = null;
    byId('turn-timer-value').textContent = '—';
    node.classList.add('no-decision');
    node.classList.remove('warning');
    node.style.setProperty('--progress','0');
    node.setAttribute('aria-label','Sin cuenta regresiva de decisión');
    return;
  }
  if (key !== timerKey) {
    timerKey = key;
    timerLeft = TIMER_SECONDS[game.phase] * timerScale();
    timerLast = performance.now();
    timerTick = -1;
  }
  node.classList.remove('no-decision');
  drawTimer();
}
function drawTimer() {
  const total = (TIMER_SECONDS[game.phase] ?? 1) * timerScale();
  const node = byId('turn-timer');
  const seconds = Math.max(0, Math.ceil(timerLeft));
  byId('turn-timer-value').textContent = String(seconds);
  node.style.setProperty('--progress', String(Math.max(0, timerLeft / total)));
  node.classList.toggle('warning', seconds <= 5);
  node.classList.toggle('paused', busy());
  node.setAttribute('aria-label', 'Quedan ' + seconds + ' segundos');
}
function timeOut() {
  timerKey = null;
  if (dialog.open) {
    pending = null;
    dialog.close();
  }
  if (searchDialog.open) searchDialog.close();
  if (rescueDialog.open) rescueDialog.close();
  cardMenu = null;
  cardMenuNode.hidden = true;
  fx.play('pass');
  bannerQueue.push({ kind: 'endturn', title: '¡TIEMPO!', subtitle: 'Se acabó el tiempo de ' + rules.SIDE[game.phase === 'reveal' ? rules.actor(game) : game.turn] });
  switch (game.phase) {
    case 'turn': nextTurn(); return;
    case 'reveal': play(); return;
    case 'bonus': selection = null; rules.skipBonus(game); break;
    case 'combo': rules.comboEliminate(game, null); break;
    case 'rescue': selection = null; rules.rescue(game, null); break;
  }
  render();
}
const MATCH_DURATION_MS = 10 * 60 * 1000;
let matchDeadline = 0;

function updateMatchClock() {
  if (!game || game.phase === 'end' || !matchDeadline) return false;
  const seconds = Math.max(0, Math.ceil((matchDeadline - Date.now()) / 1000));
  const clock = byId('match-clock');
  const label = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  if (clock.textContent !== label) {
    clock.textContent = label;
    clock.dateTime = 'PT' + seconds + 'S';
  }
  if (seconds > 0) return false;
  if (!rules.finishOnTime(game)) return false;
  ended = matchDeadline;
  clearTimeout(progressTimer);
  clearTimeout(bannerTimer);
  bannerQueue = [];
  bannerShowing = false;
  byId('phase-banner').hidden = true;
  document.body.classList.remove('banner-on');
  clearEffects();
  pending = null;
  for (const node of [dialog, searchDialog, rescueDialog, ...matchDialogs]) if (node.open) node.close();
  closeCardMenu();
  drag?.ghost?.remove();
  drag = null;
  selection = null;
  duel = null;
  combatIntro = false;
  document.body.classList.remove('combat-intro');
  battleResult = null;
  clearSpecial();
  announcedEvents = game.events.length - 2;
  render();
  return true;
}
document.addEventListener('visibilitychange', updateMatchClock);
for (const action of ['click', 'pointerdown', 'keydown']) {
  document.addEventListener(action, event => {
    if (!updateMatchClock()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}
setInterval(() => {
  if (updateMatchClock()) return;
  const now = performance.now();
  const elapsed = (now - timerLast) / 1000;
  timerLast = now;
  if (!game || !timerKey || timerKey !== timerContext()) return;
  if (busy() || document.hidden) {
    drawTimer();
    return;
  }
  timerLeft -= elapsed;
  const seconds = Math.ceil(timerLeft);
  if (seconds <= 5 && seconds > 0 && seconds !== timerTick) {
    timerTick = seconds;
    fx.play('tick');
  }
  drawTimer();
  if (timerLeft <= 0) timeOut();
}, 200);

// === Pantallas de victoria o derrota y estadísticas ===
let endShown = false;
function maybeShowEnd() {
  if (!game || game.phase !== 'end' || endShown || fxBusy || bannerShowing || bannerQueue.length) return;
  endShown = true;
  const winner = game.winner;
  const screen = byId('end-screen');
  let kind, title;
  if (!winner) { kind = 'draw'; title = 'EMPATE'; }
  else if (mode === 'ai') { kind = winner === 'I' ? 'win' : 'lose'; title = winner === 'I' ? '¡VICTORIA!' : 'DERROTA'; }
  else { kind = 'win'; title = '¡VICTORIA!'; }
  screen.dataset.kind = kind;
  screen.dataset.side = winner ?? '';
  byId('end-kicker').textContent = winner ? 'Ganan los ' + rules.SIDE[winner] : 'Nadie gana';
  byId('end-title').textContent = game.timeResult ? 'FIN DEL JUEGO' : title;
  byId('end-text').textContent = game.reason === 'eliminación'
    ? 'La partida se decidió por eliminación en la ronda ' + game.round + '.'
    : 'Se completaron las 12 rondas: ' + rules.remaining(game, 'I') + ' fichas idealistas contra ' + rules.remaining(game, 'R') + ' realistas.';
  if (game.timeResult) {
    const { scores, criterion } = game.timeResult;
    const explanations = { pieces: 'fichas vivas', cards: 'cartas activadas', powerful: 'cartas poderosas activadas' };
    byId('end-text').textContent = 'Se cumplieron los 10 minutos. ' + (criterion
      ? 'Deciden las ' + explanations[criterion] + ': ' + scores.I[criterion] + ' Idealistas, ' + scores.R[criterion] + ' Realistas.'
      : 'Ambos bandos empataron en los tres criterios.');
  }
  screen.hidden = false;
  fx.duck(.3);
  fx.play(kind === 'lose' ? 'defeat' : 'victory');
  byId('end-ok').focus();
}
function gameStats() {
  const stats = {};
  for (const side of ['I', 'R']) stats[side] = { remaining: rules.remaining(game, side), kills: 0, won: 0, ties: 0,
    specials: 0, cards: 0, combos: 0, rescues: 0, cannons: 0, favorite: {} };
  const heroes = {};
  let lastAttack = null, lastWinner = null;
  for (const event of game.events) {
    switch (event.type) {
      case 'attack': lastAttack = event; break;
      case 'special': stats[event.side].specials++; break;
      case 'reveal':
        stats[event.side].cards++;
        stats[event.side].favorite[event.card] = (stats[event.side].favorite[event.card] ?? 0) + 1;
        break;
      case 'combo-card': stats[event.side].combos++; break;
      case 'rescue': stats[event.side].rescues++; break;
      case 'summon': stats[event.side].cannons++; break;
      case 'battle': {
        if (!event.winner) {
          stats.I.ties++;
          stats.R.ties++;
          lastWinner = null;
          break;
        }
        stats[event.winner].won++;
        stats[event.winner].kills += event.removed.length;
        lastWinner = lastAttack && (event.winner === event.attacker ? lastAttack.piece : lastAttack.target);
        if (lastWinner) heroes[lastWinner] = (heroes[lastWinner] ?? 0) + event.removed.length;
        break;
      }
      case 'combo':
      case 'double':
        stats[event.side].kills++;
        if (lastWinner) heroes[lastWinner] = (heroes[lastWinner] ?? 0) + 1;
        break;
    }
  }
  const [mvp, mvpKills] = Object.entries(heroes).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return { stats, mvp, mvpKills };
}
function showStats() {
  byId('end-screen').hidden = true;
  const { stats, mvp, mvpKills } = gameStats();
  const seconds = started === null ? 0 : Math.floor(((ended ?? Date.now()) - started) / 1000);
  byId('stats-summary').textContent = 'Rondas: ' + game.round + ' · Duración: ' + Math.floor(seconds / 60) + ' min '
    + String(seconds % 60).padStart(2, '0') + ' s · ' + (game.winner ? 'Ganan los ' + rules.SIDE[game.winner] : 'Empate');
  const hero = byId('stats-mvp');
  hero.replaceChildren();
  const piece = mvp && rules.piece(game, mvp);
  if (piece) {
    hero.dataset.side = piece.side;
    hero.append(makeToken({ ...piece, cannon: false }));
    const text = span(hero, 'stats-mvp-text', '');
    span(text, 'stats-mvp-label', 'Ficha más valiosa');
    span(text, 'stats-mvp-name', pieceName({ ...piece, cannon: false }));
    span(text, 'stats-mvp-detail', mvpKills + (mvpKills === 1 ? ' baja causada' : ' bajas causadas'));
  } else span(hero, 'stats-mvp-label', 'Sin bajas en esta partida');
  const favorite = side => {
    const [card] = Object.entries(stats[side].favorite).sort((a, b) => b[1] - a[1])[0] ?? [];
    return card ? rules.CARDS[card].name : '—';
  };
  const rows = [
    ['Fichas en pie', s => stats[s].remaining],
    ['Bajas causadas', s => stats[s].kills],
    ['Batallas ganadas', s => stats[s].won],
    ['Empates (doble baja)', s => stats[s].ties],
    ['Ataques especiales', s => stats[s].specials],
    ['Cartas activadas', s => stats[s].cards],
    ['Combos', s => stats[s].combos],
    ['Cañones invocados', s => stats[s].cannons],
    ['Rescates', s => stats[s].rescues],
    ['Carta favorita', favorite],
  ];
  byId('stats-rows').replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement('tr');
    const head = document.createElement('th');
    head.scope = 'row';
    head.textContent = label;
    row.append(head);
    for (const side of ['I', 'R']) {
      const cell = document.createElement('td');
      cell.className = 'col-' + side;
      cell.textContent = String(value(side));
      row.append(cell);
    }
    return row;
  }));
  byId('stats-screen').hidden = false;
  byId('stats-again').focus();
}
function hideEndScreens() {
  byId('end-screen').hidden = true;
  byId('stats-screen').hidden = true;
}
byId('end-ok').addEventListener('click', showStats);
byId('stats-again').addEventListener('click', () => startGame(mode));
byId('stats-menu').addEventListener('click', returnToMenu);
byId('stats-export').addEventListener('click', () => byId('export').click());

function render() {
  if (game.phase === 'end' && ended === null) ended = Date.now();
  byId('partida').dataset.phase = game.phase;
  byId('round-value').textContent = game.round;
  const actor = ai.decisionSide(game, rules);
  const turnLabel = byId('active-side');
  const turnText = actor === null ? 'PARTIDA TERMINADA'
    : mode === 'ai' ? (actor === 'I' ? 'TU TURNO' : 'TURNO DEL RIVAL')
    : 'TURNO ' + rules.SIDE[actor].toUpperCase();
  if (turnLabel.textContent !== turnText) turnLabel.textContent = turnText;
  turnLabel.dataset.side = actor ?? '';
  turnLabel.dataset.mine = String(mode === 'ai' && actor === 'I');
  document.body.dataset.turnSide = actor ?? '';
  for (const [side, color] of [['I', 'blue'], ['R', 'red']]) {
    const { rescues, deck, charge } = game.players[side];
    const seat = byId(color).closest('.seat');
    seat.dataset.prompt = String(side === actor);
    if (side === actor) seat.setAttribute('aria-current', 'true');
    else seat.removeAttribute('aria-current');
    byId(color + '-rescues').textContent = rescues;
    const savedBadge = byId(color + '-saved');
    const saved = game.players[side].savedRescues.length;
    savedBadge.hidden = !saved;
    savedBadge.textContent = '+' + saved;
    savedBadge.title = saved + ' estrellas guardadas; ' + rules.availableSavedRescues(game,side) + ' habilitadas';
    byId('deck-' + side).textContent = deck.length;
    const bar = byId('charge-' + side);
    [...bar.children].forEach((segment, i) => segment.classList.toggle('full', i < charge));
    bar.classList.toggle('ready', charge >= rules.CHARGE_MAX);
    bar.setAttribute('aria-label', charge >= rules.CHARGE_MAX ? 'Ataque especial listo'
      : 'Ataque especial: ' + charge + ' de ' + rules.CHARGE_MAX);
  }
  renderActionStatus();
  renderSavedRescue();
  phaseIndicator.textContent = currentPhase();
  phaseIndicator.dataset.phase = game.phase;
  byId('turn-info').textContent = game.phase === 'reveal' ? 'Carta o pase ' + (game.battle.slot + 1) + ' de 4'
    : game.phase === 'turn' ? 'Acciones: ' + game.actions + ' de 2' : '';
  const result = byId('battle-result');
  result.hidden = !battleResult;
  if (battleResult) {
    result.dataset.winner = battleResult.winner ?? '';
    result.textContent = (battleResult.decisiveCombo ? '¡COMBO DECISIVO! · '
      : battleResult.combos?.I || battleResult.combos?.R ? '¡COMBO +1! · '
        : battleResult.advantage ? 'Golpe decisivo · ' : '')
      + describe(battleResult);
  }
  document.body.classList.toggle('revealing', game.phase === 'reveal');
  renderBoard();
  renderHands();
  renderControls();
  renderSpecialFire();
  syncTimer();
  layoutScene();
  byId('log').replaceChildren(...game.events.slice(-8).reverse().map(event => {
    const item = document.createElement('li');
    item.textContent = describe(event);
    return item;
  }));
  // El duelo sigue a la vista mientras se animan las cartas de una batalla recién resuelta.
  duelHold = game.events.slice(announcedEvents).some(event => event.type === 'battle');
  renderDuel();
  announceNewEvents();
  // Los contadores de fichas cambian después de la explosión, no antes.
  if (!fxBusy) syncCounters();
  scheduleProgress();
}
function syncCounters(pulse = false) {
  for (const [side, id] of [['I', 'blue'], ['R', 'red']]) {
    const node = byId(id);
    const value = String(rules.remaining(game, side));
    const meter = byId(id + '-health');
    const previous = Number(meter.getAttribute('aria-valuenow'));
    meter.setAttribute('aria-valuenow', value);
    meter.setAttribute('aria-valuetext', value + ' de 8 fichas vivas');
    meter.title = rules.SIDE[side] + ': ' + value + ' de 8 fichas vivas';
    [...meter.children].forEach((segment, i) => {
      const full = i < Number(value);
      if (segment.classList.contains('full') !== full) {
        segment.classList.toggle('full', full);
        if (pulse && !reducedMotion()) {
          segment.classList.remove('health-change');
          void segment.offsetWidth;
          segment.classList.add('health-change');
        }
      }
    });
    if (previous === Number(value) && node.textContent === value) continue;
    node.textContent = value;
    if (pulse && !reducedMotion()) {
      node.classList.remove('count-drop');
      void node.offsetWidth;
      node.classList.add('count-drop');
    }
  }
}
function renderActionStatus() {
  const group = byId('action-status');
  group.hidden = game.phase !== 'turn';
  const state = rules.turnActions(game);
  for (const [action, label] of [['move', 'Mover'], ['attack', 'Atacar']]) {
    const node = byId(action + '-status');
    node.dataset.state = state[action];
    const description = { ready: 'disponible', waiting: 'sin destino válido por ahora', spent: 'usado' }[state[action]];
    node.setAttribute('aria-label', label + ': ' + description);
    node.title = label + ': ' + description;
  }
}
function shouldAutoEndTurn() {
  if (game.phase !== 'turn') return false;
  const actions = rules.turnActions(game);
  return actions.move !== 'ready' && actions.attack !== 'ready' && !rules.canUseSavedRescue(game);
}
function scheduleProgress() {
  clearTimeout(progressTimer);
  progressTimer = null;
  if (!game || dialog.open || searchDialog.open || rescueDialog.open || busy()) return;
  if (game.phase === 'rescue' && !isAITurn()) { showRescuePicker(); return; }
  if (!shouldAutoEndTurn() && !isAITurn()) return;
  progressTimer = setTimeout(() => {
    progressTimer = null;
    if (updateMatchClock()) return;
    if (!game || dialog.open || searchDialog.open || busy()) return;
    if (shouldAutoEndTurn()) {
      nextTurn();
      return;
    }
    if (!isAITurn()) return;
    const action = ai.choose(rules, game, 'R');
    if (!action) return;
    switch (action.type) {
      case 'attack':
        startAttack(rules.piece(game, action.piece), rules.piece(game, action.target));
        return;
      case 'reveal': play(action.index, action.searchTarget ?? null); return;
      case 'combo': rules.comboEliminate(game, action.target); break;
      case 'nextTurn': nextTurn(); return;
      case 'move': rules.move(game, action.piece, action.cell); break;
      case 'rescue': rules.rescue(game, action.piece, action.cell); break;
      case 'savedRescue': rules.startSavedRescue(game); break;
      case 'special':
        startSpecial(rules.piece(game, action.piece), rules.piece(game, action.target), action.at);
        return;
      case 'skipBonus': rules.skipBonus(game); break;
    }
    render();
  }, game.phase === 'reveal' ? 650 : 440);
}
function resetPresentation() {
  clearTimeout(progressTimer);
  clearTimeout(bannerTimer);
  bannerQueue = [];
  bannerShowing = false;
  announcedEvents = 0;
  clearEffects();
  byId('phase-banner').hidden = true;
  if (searchDialog.open) searchDialog.close();
  if (rescueDialog.open) rescueDialog.close();
  combatIntro = false;
  document.body.classList.remove('combat-intro');
  drag?.ghost?.remove();
  drag = null;
  selection = null;
  cardMenu = null;
  cardMenuNode.hidden = true;
  battleResult = null;
  duel = null;
  duelPlayed = { I: [], R: [] };
  duelSlots = { I: [], R: [] };
  duelSpecial = null;
  duelHold = false;
  clearSpecial();
  endShown = false;
  hideEndScreens();
  timerKey = null;
  matchDeadline = 0;
  handOwner = null;
  started = null;
  ended = null;
}
function startGame(nextMode) {
  resetPresentation();
  fx.music('battle');
  if (!sceneGeometry) applyBoardTheme();
  const video = board.querySelector('.board-video');
  if (video && !reducedMotion()) video.play().catch(() => {});
  mode = nextMode;
  game = rules.makeGame();
  started = Date.now();
  matchDeadline = started + MATCH_DURATION_MS;
  handOwner = 'I';
  byId('match-clock').hidden = false;
  updateMatchClock();
  byId('inicio').hidden = true;
  byId('partida').hidden = false;
  document.body.classList.add('playing');
  layoutScene();
  coverHeaderActions.hidden = true;
  gameMenuButton.hidden = false;
  byId('red-ai').hidden = mode !== 'ai';
  render();
  byId('partida').focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
function returnToMenu() {
  resetPresentation();
  fx.music('menu');
  game = null;
  mode = null;
  byId('match-clock').hidden = true;
  byId('inicio').hidden = false;
  byId('partida').hidden = true;
  document.body.classList.remove('playing', 'revealing');
  layoutScene();
  coverHeaderActions.hidden = false;
  gameMenuButton.hidden = true;
  byId('play-local').focus();
  window.scrollTo(0, 0);
}
function confirmRestart(title, label, callback) {
  if (game?.events.length > 1 && game.phase !== 'end') {
    confirmAction(title, 'Se cerrará la partida actual.', label, callback);
  } else callback();
}
byId('play-local').addEventListener('click', () => startGame('local'));
byId('play-ai').addEventListener('click', () => startGame('ai'));
byId('menu-link').addEventListener('click', event => {
  event.preventDefault();
  if (game) confirmRestart('¿Volver al menú?', 'Volver al menú', returnToMenu);
});
byId('restart').addEventListener('click', () => {
  gameMenu.close();
  confirmRestart('¿Empezar otra partida?', 'Nueva partida', () => startGame(mode));
});
byId('export').addEventListener('click', () => {
  const data = { version: '0.15', mode, complete: game.phase === 'end', round: game.round,
    durationSeconds: started === null ? 0 : Math.floor(((ended ?? Date.now()) - started) / 1000),
    winner: game.winner, reason: game.reason, events: game.events };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'reales-ideales-partida.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});


// === Bienvenida y precarga: cinco segundos de presentación, sin bloquear por una red lenta. ===
const STARTUP_MIN_MS = 5000;
const STARTUP_MAX_MS = 8000;
const startupImages = [
  'assets/logo.webp', 'assets/clay/portada-jardin.webp',
  'assets/clay/terracota.webp', 'assets/clay/campo-jardin.webp',
  'assets/clay/flor.webp', 'assets/clay/relieve.webp', 'assets/clay/jardin-izquierdo.webp',
  'assets/clay/jardin-derecho.webp', 'assets/clay/cordon.webp',
  'assets/clay/dorso-idealista.webp', 'assets/clay/dorso-realista.webp',
  'assets/v014/cartas-aprobadas.webp', 'assets/v014/canon.webp',
  'assets/escenario/campo-andino-poster.webp', 'assets/escenario/campo-andino-fondo.webp',
  ...['rescate', 'idealista', 'realista', 'turno', 'boost', 'decisive', 'cannon', 'weaken', 'major']
    .map(name => 'assets/clay/emblemas/' + name + '.webp'),
  ...Object.entries(rules.ROSTER).flatMap(([side, roster]) => roster.map(animal =>
    'assets/clay/fichas/' + tokenFaction[side] + '-' + animal + '.webp')),
];
const startupImageCache = new Map();
function preloadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    startupImageCache.set(src, img);
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
    if (img.complete) resolve(img.naturalWidth > 0);
  });
}
function waitForMedia(media) {
  if (!media) return Promise.resolve(true);
  if (media.readyState >= 2) return Promise.resolve(true);
  if (media.error) return Promise.resolve(false);
  return new Promise(resolve => {
    const settle = ok => {
      media.removeEventListener('loadeddata', ready);
      media.removeEventListener('canplay', ready);
      media.removeEventListener('error', failed);
      resolve(ok);
    };
    const ready = () => settle(true);
    const failed = () => settle(false);
    media.addEventListener('loadeddata', ready, { once: true });
    media.addEventListener('canplay', ready, { once: true });
    media.addEventListener('error', failed, { once: true });
  });
}
function startupTasks() {
  const tasks = [...new Set(startupImages)].map(preloadImage);
  preparePlayedCardPngs();
  applyBoardTheme();
  const video = board.querySelector('.board-video');
  if (video) tasks.push(waitForMedia(video));
  if (fx.musicOn()) {
    tasks.push(waitForMedia(fx.preloadMusic('menu')));
    tasks.push(waitForMedia(fx.preloadMusic('battle')));
  }
  return tasks;
}
let startupStarted = false;
function beginStartup() {
  if (startupStarted) return;
  startupStarted = true;
  // Debe ocurrir en el gesto de usuario, antes de cualquier await o temporizador.
  fx.music('menu');
  const start = performance.now();
  const intro = byId('startup');
  const continueButton = byId('startup-continue');
  const loading = byId('startup-loading');
  const progress = byId('startup-progress');
  const percent = byId('startup-percent');
  const status = byId('startup-status');
  continueButton.disabled = true;
  continueButton.hidden = true;
  loading.hidden = false;
  intro.setAttribute('aria-busy', 'true');
  let tasks = [];
  try { tasks = startupTasks(); } catch (error) { console.warn('Precarga parcial', error); }
  let settled = 0, failed = 0;
  for (const task of tasks) Promise.resolve(task).then(ok => {
    settled++;
    if (!ok) failed++;
  }, () => { settled++; failed++; });
  const tick = () => {
    const elapsed = performance.now() - start;
    const complete = settled === tasks.length;
    const deadline = elapsed >= STARTUP_MAX_MS;
    const canEnter = elapsed >= STARTUP_MIN_MS && (complete || deadline);
    const timeShare = Math.min(1, elapsed / STARTUP_MIN_MS);
    const resourceShare = tasks.length ? settled / tasks.length : 1;
    const value = canEnter ? 100 : Math.min(99, Math.floor(100 * (.65 * timeShare + .35 * resourceShare)));
    progress.value = value;
    percent.textContent = value + ' %';
    if (elapsed >= STARTUP_MIN_MS && !complete) status.textContent = 'Preparando los últimos recursos…';
    if (!canEnter) { requestAnimationFrame(tick); return; }
    status.textContent = complete && !failed ? '¡Listo!' : 'Entrando al menú…';
    // Los recursos lentos siguen cargando de forma nativa sin bloquear el menú.
    requestAnimationFrame(() => {
      intro.hidden = true;
      intro.removeAttribute('aria-busy');
      document.body.classList.remove('booting');
      document.querySelector('.masthead').hidden = false;
      byId('inicio').hidden = false;
      byId('play-local').focus({ preventScroll: true });
    });
  };
  requestAnimationFrame(tick);
}
byId('startup-continue').addEventListener('click', beginStartup);
byId('startup-continue').disabled = false;
