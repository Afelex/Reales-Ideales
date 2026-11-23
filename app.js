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
let aiTimer = null;
let selection = null;
let privateHand = false;
let pending = null;
let drag = null;
let suppressClick = false;
let shown = { I: [], R: [] };
let restoreCards = null;
let battleResult = null;
let duel = null;
let started = null;
let ended = null;
let drawerOpen = false;
let lastRevealBattle = null;
let lastRevealSlot = -1;
let bannerTimer = null;
let bannerQueue = [];
let bannerShowing = false;
let announcedEvents = 0;
const searchDialog = byId('search-choice');

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
    scheduleAI();
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
    case 'turn': return { kind: event.side, title: 'TURNO DE ' + rules.SIDE[event.side].toUpperCase(), subtitle: 'Prepara tu movimiento o ataque' };
    case 'move': return { kind: 'move', title: 'FASE DE MOVIMIENTO', subtitle: event.piece + ' avanza en el tablero' };
    case 'special': return { kind: 'special', title: event.power.toUpperCase(),
      subtitle: animals[event.animal] + ' ' + event.piece + ': ' + rules.SPECIALS[event.animal].description };
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
    case 'end': return { kind: 'end', title: 'FIN DE PARTIDA', subtitle: event.text };
    default: return null;
  }
}
function showNextBanner() {
  clearTimeout(bannerTimer);
  if (!game || !bannerQueue.length) {
    byId('phase-banner').hidden = true;
    bannerShowing = false;
    scheduleAI();
    return;
  }
  const next = bannerQueue.shift();
  const node = byId('phase-banner');
  node.dataset.kind = next.kind;
  byId('banner-title').textContent = next.title;
  byId('banner-subtitle').textContent = next.subtitle;
  node.hidden = false;
  bannerShowing = true;
  bannerTimer = setTimeout(() => {
    node.hidden = true;
    bannerShowing = false;
    showNextBanner();
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 500 : 1350);
}
function announceNewEvents() {
  const newEvents = game.events.slice(announcedEvents);
  announcedEvents = game.events.length;
  for (const event of newEvents) {
    const banner = bannerFromEvent(event);
    if (banner) bannerQueue.push(banner);
  }
  // Primero la animación, después el banner: como en los juegos de artillería.
  const duration = playEffects(newEvents);
  if (duration > 0) {
    fxBusy = true;
    document.body.classList.add('fx-busy');
    clearTimeout(fxBusyTimer);
    fxBusyTimer = setTimeout(releaseEffects, duration);
  } else if (!fxBusy && !bannerShowing && bannerQueue.length) showNextBanner();
}
function releaseEffects() {
  fxBusy = false;
  fxBusyTimer = null;
  document.body.classList.remove('fx-busy');
  if (!game) return;
  syncCounters();
  if (duelHold) {
    duelHold = false;
    renderDuel();
  }
  if (!bannerShowing && bannerQueue.length) showNextBanner();
  else scheduleAI();
}
// Ocupado mientras hay animación o banner: se bloquean clics y la IA.
function busy() {
  return fxBusy || bannerShowing;
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
  }, ms);
  fxTimers.push(timer);
}
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
function cellPoint(cell) {
  const rect = hexButtons.get(cell)?.getBoundingClientRect();
  if (!rect?.width) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: rect.width };
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
  setTimeout(() => node.remove(), life);
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
  return point && { width: point.size * .78, height: point.size * .78 };
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
// Ataque especial: aura de poder sobre la ficha y su nombre en grande.
const SPECIAL_MS = 1500;
function specialCall(event) {
  const point = cellPoint(pieceCell(event.piece));
  fx.play('special');
  spawn('fx-power-aura side-' + event.side, point, {}, SPECIAL_MS);
  const title = spawn('fx-power-name side-' + event.side, { x: window.innerWidth / 2, y: window.innerHeight * .3, size: 0 }, {}, SPECIAL_MS);
  if (title) title.textContent = event.power;
  if (!reducedMotion()) shake();
}
function attackSequence(event) {
  const fromCell = pieceCell(event.piece), toCell = pieceCell(event.target);
  speech(fromCell, event.special ? '¡' + rules.SPECIALS[event.special].name + '!' : '¡Al ataque!', event.side, 1200);
  fx.play('charge');
  later(SHOT_DELAY, () => fireShell(fromCell, toCell, event.side));
}
function fireShell(fromCell, toCell, side) {
  const from = cellPoint(fromCell), to = cellPoint(toCell);
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
// Escaparate de carta: la carta activada entra volando desde su bando,
// se voltea y muestra nombre y efecto para que el rival la vea.
const SHOWCASE_MS = 1700;
function showcase(event) {
  const card = event.type === 'reveal' ? event.card : null;
  const node = spawn('fx-showcase from-' + event.side, { x: window.innerWidth / 2, y: window.innerHeight * .42, size: 0 }, {},
    card ? SHOWCASE_MS : 1000);
  if (!node) return;
  const role = game.battle && event.side === game.battle.defender ? 'responden' : 'activan';
  span(node, 'fx-showcase-who', rules.SIDE[event.side] + (card ? ' ' + role : ' pasan'));
  if (!card) {
    node.classList.add('pass');
    span(node, 'fx-showcase-pass', 'Sin carta');
    fx.play('pass');
    return;
  }
  const [color, glow] = cardColors[card];
  node.style.setProperty('--color', color);
  node.style.setProperty('--glow', glow);
  const face = span(node, 'card front fx-showcase-card', '');
  renderCardFace(face, card);
  span(node, 'fx-showcase-effect', rules.CARDS[card].description);
  fx.play('deal');
  later(380, () => {
    applyCardForce(event.side, card);
    fx.play(card);
    const burst = spawn('fx-card-burst', { x: window.innerWidth / 2, y: window.innerHeight * .42, size: 0 }, { color, glow }, 1100);
    if (burst && fxEmblems.has(card)) {
      const emblem = document.createElement('img');
      emblem.src = 'assets/clay/emblemas/' + card + '.webp';
      emblem.alt = '';
      burst.append(emblem);
    } else if (burst) burst.textContent = fxSymbols[card];
  });
}
// Suma la carta al marcador del duelo y hace volar el número ganado o perdido.
function floatNumber(side, text, kind) {
  let target = byId('duel').querySelector('[data-force="' + side + '"]');
  let rect = target?.getBoundingClientRect();
  // En móvil el cajón de cartas tapa el duelo: el número vuela al resumen de fuerza.
  const covered = !rect?.width || !document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('#duel');
  const hint = byId('drawer-hint').querySelector('.hint-force');
  if (covered && hint && !byId('hand-drawer').hidden) {
    target = hint;
    rect = hint.getBoundingClientRect();
  }
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
  duelPlayed[side] = [...duelPlayed[side], card];
  renderDuel();
  renderForceHint();
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
    case 'end':
      fx.play('victory');
      flash('#f0b52e', '#fff7e6');
      spawn('fx-rays', centerPoint(), {}, 1600);
  }
}
// Duración de cada animación: el siguiente evento y los banners esperan a que termine.
const fxDurations = { move: DRIVE_MS + 800, bonus: DRIVE_MS + 800, advance: DRIVE_MS + 800,
  attack: SHOT_DELAY + SHOT_FLIGHT + 500, reveal: SHOWCASE_MS, pass: 900, 'combo-card': 700,
  'combo-ready': 700, battle: 1100, combo: 1000, double: 1000, 'double-ready': 700, summon: 1100, rescue: 1100,
  end: 1200, special: SPECIAL_MS, leap: DRIVE_MS + 300 };
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
function syncSoundToggle() {
  const on = !fx.isMuted();
  const toggle = byId('sound-toggle');
  toggle.dataset.sound = on ? 'on' : 'off';
  toggle.setAttribute('aria-pressed', String(on));
  toggle.setAttribute('aria-label', on ? 'Sonido activado' : 'Sonido desactivado');
}
byId('sound-toggle').addEventListener('click', () => {
  fx.setMuted(!fx.isMuted());
  syncSoundToggle();
});
syncSoundToggle();
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
function pieceName(piece) {
  return (piece.cannon ? 'Cañón' : animals[character(piece)]) + ' ' + piece.id;
}
function makeToken(piece) {
  const node = document.createElement('span');
  node.className = 'token ' + piece.side + (piece.cannon ? ' cannon' : '');
  node.dataset.piece = piece.id;
  node.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img');
  image.className = 'token-art';
  image.src = piece.cannon ? newAsset('canon.png')
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

  const { center, edges } = boardColumns[cell.col];
  const rowIndex = Math.floor((cell.row - 1) / 2);
  const top = edges[rowIndex];
  const bottom = edges[rowIndex + 1];
  hex.style.left = (center / 1116 * 100) + '%';
  hex.style.top = ((top + bottom) / 2 / 1410 * 100) + '%';
  hex.style.height = ((bottom - top) / 1410 * 100) + '%';
  hexButtons.set(cell.id, hex);
}
function isAITurn() {
  return mode === 'ai' && ai.decisionSide(game, rules) === 'R';
}
function selectable(id) {
  return rules.moves(game, id).length > 0 || rules.attacks(game, id).length > 0 || rules.specialOptions(game, id).length > 0;
}
// Modo de ataque especial: se elige el poder y luego el objetivo (y la casilla, si el poder desplaza).
let specialMode = false;
let specialAt = null;
function specialView() {
  if (!specialMode || !selection) return null;
  const piece = rules.piece(game, selection);
  const options = rules.specialOptions(game, selection);
  const at = specialAt ?? piece.cell;
  return {
    targets: options.filter(o => o.at === at).map(o => o.target),
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
  started ??= Date.now();
  clearRevealed();
  battleResult = null;
  // El duelo muestra la ficha tal como empieza el combate (ya en su casilla de ataque).
  duel = [{ ...attacker }, { ...rules.piece(game, defender.id) }];
  duelPlayed = { I: [], R: [] };
  duelSpecial = game.battle.special;
  duelHold = false;
  selection = null;
  clearSpecial();
  privateHand = false;
  render();
}
function proposeDestination(id, cell) {
  const actor = rules.piece(game, id);
  if (rules.moves(game, id).includes(cell)) {
    confirmAction('¿Mover la ficha?', 'Mover a ' + pieceName(actor) + ' a la casilla ' + cell + '.', 'Mover', () => {
      started ??= Date.now();
      rules.move(game, id, cell);
      drawerOpen = false;
      privateHand = false;
      selection = null;
      render();
    });
    return true;
  }
  const target = rules.occupant(game, cell);
  if (target && rules.attacks(game, id).includes(target.id)) {
    confirmAction('¿Atacar a esta ficha?', pieceName(actor) + ' atacará a ' + pieceName(target) + ' en ' + cell + '.', 'Atacar', () => {
      startAttack(actor, target);
    });
    return true;
  }
  return false;
}
function startAttack(attacker, defender) {
  if (!rules.attack(game, attacker.id, defender.id)) return;
  started ??= Date.now();
  clearRevealed();
  battleResult = null;
  duel = [{ ...attacker }, { ...defender }];
  duelPlayed = { I: [], R: [] };
  duelSpecial = null;
  duelHold = false;
  selection = null;
  clearSpecial();
  privateHand = false;
  render();
}
function clickCell(cell) {
  if (!game || isAITurn() || busy()) return;
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
    const power = rules.SPECIALS[attacker.animal];
    if (special.destinations.includes(cell)) {
      specialAt = cell;
    } else if (piece && special.targets.includes(piece.id)) {
      const at = special.at;
      confirmAction('¿Lanzar ' + power.name + '?', pieceName(attacker) + ' usará ' + power.name + ' contra ' + pieceName(piece)
        + (at !== attacker.cell ? ' desde ' + at : '') + '. ' + power.description, 'Lanzar', () => startSpecial(attacker, piece, at));
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
    privateHand = false;
    if (selection && proposeDestination(selection, cell)) return;
    if (piece && selectable(piece.id)) selection = selection === piece.id ? null : piece.id;
    else selection = null;
    clearSpecial();
  }
  render();
}
function renderBoard() {
  const special = specialView();
  const moves = special ? special.destinations : selection ? rules.moves(game, selection) : [];
  const targets = special ? special.targets : selection ? rules.attacks(game, selection) : [];
  for (const [cell, hex] of hexButtons) {
    const piece = rules.occupant(game, cell);
    const star = rescueCells.has(cell);
    let target = moves.includes(cell) ? 'move' : targets.includes(piece?.id) ? 'target' : '';
    if (game.phase === 'rescue' && selection && !piece && rules.ZONES[game.rescue.side].includes(cell)) target = 'move';
    if (special && cell === special.at && specialAt) target = 'origin';
    if (special && piece?.id === selection) hex.dataset.power = 'true';
    else delete hex.dataset.power;
    if (game.phase === 'combo' && piece && rules.comboTargets(game).includes(piece.id)) target = 'target';
    hex.dataset.highlight = target;
    hex.setAttribute('aria-pressed', String(Boolean(piece && piece.id === selection)));
    hex.setAttribute('aria-label', [cell, star ? 'estrella de rescate' : '', piece
      ? rules.SIDE[piece.side] + ' · ' + pieceName(piece) : 'libre',
      target === 'target' ? 'objetivo de ataque' : target === 'move' ? 'movimiento disponible' : ''].filter(Boolean).join(', '));
    hex.replaceChildren();
    if (piece) {
      const token = makeToken(piece);
      if (drag?.ghost && drag.id === piece.id) token.classList.add('origin');
      if (fxHidden.has(piece.id)) token.classList.add('fx-pending');
      hex.append(token);
    }
  }
}
board.addEventListener('pointerdown', event => {
  suppressClick = false;
  if (!game || isAITurn() || dialog.open || searchDialog.open || busy() || !event.isPrimary || event.button !== 0) return;
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
    privateHand = false;
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

function clearRevealed() {
  clearTimeout(restoreCards);
  restoreCards = null;
  shown = { I: [], R: [] };
}
function play(index = null, slot = null, searchTarget = null) {
  const side = rules.actor(game);
  const card = index === null ? null : game.players[side].hand[index];
  if (card && slot === null) slot = index;
  if (!rules.reveal(game, index, searchTarget)) return;
  if (card) shown[side].push({ slot, card, latest: true });
  privateHand = false;
  if (game.phase !== 'reveal') {
    battleResult = game.events.findLast(event => event.type === 'battle');
    restoreCards = setTimeout(() => {
      clearRevealed();
      if (game) renderHands();
    }, 1550);
  }
  render();
  if (card && shown[side].length) shown[side].at(-1).latest = false;
}
function chooseSearch(index) {
  const side = rules.actor(game);
  const options = rules.searchOptions(game, side);
  if (!options.length) {
    play(index, index, null);
    return;
  }
  const choices = byId('search-options');
  choices.replaceChildren();
  for (const card of options) {
    const copies = game.players[side].deck.filter(value => value === card).length
      - game.battle.search[side].filter(value => value.card === card).length;
    const option = button(choices, rules.CARDS[card].name + ' · ' + copies + ' en el mazo', () => {
      searchDialog.close();
      play(index, index, card);
    }, 'secondary search-option illustrated');
    option.dataset.card = card;
    const thumbnail = span(option, 'card-art', '');
    thumbnail.setAttribute('aria-hidden', 'true');
    option.prepend(thumbnail);
  }
  searchDialog.showModal();
}
function syncHandDrawer() {
  const revealing = game.phase === 'reveal';
  const actor = revealing ? rules.actor(game) : game.turn;
  // Cada ventana de elección vuelve a estar cubierta, incluso en el modo local.
  // Evita que un jugador vea las cartas privadas del siguiente participante.
  if (revealing && (game.battle !== lastRevealBattle || game.battle.slot !== lastRevealSlot)) {
    lastRevealBattle = game.battle;
    lastRevealSlot = game.battle.slot;
    privateHand = false;
    peeked = new Set();
    closeCardMenu();
    drawerOpen = !isAITurn();
  } else if (!revealing) {
    if (lastRevealBattle) {
      drawerOpen = false;
      privateHand = false;
      peeked = new Set();
    }
    lastRevealBattle = null;
    lastRevealSlot = -1;
    if (game.phase !== 'turn') drawerOpen = false;
  }
  const drawer = byId('hand-drawer');
  drawer.hidden = !drawerOpen || isAITurn();
  drawer.dataset.side = actor;
  byId('drawer-title').textContent = revealing
    ? (actor === game.battle.defender ? 'Defensa' : 'Ataque') + ' · ' + rules.SIDE[actor]
    : 'Reserva · ' + rules.SIDE[actor];
  renderForceHint(revealing, actor);
  byId('hand-I').hidden = actor !== 'I';
  byId('hand-R').hidden = actor !== 'R';
}
function renderForceHint(revealing = game.phase === 'reveal', actor = revealing ? rules.actor(game) : game.turn) {
  const hint = byId('drawer-hint');
  hint.replaceChildren();
  const summary = revealing ? forceSummary() : null;
  if (summary) {
    const mine = duel[0].side === actor ? summary.a : summary.d;
    const theirs = duel[0].side === actor ? summary.d : summary.a;
    const status = mine.total > theirs.total ? 'Vas ganando' : mine.total < theirs.total ? 'Vas perdiendo' : 'Empate';
    span(hint, 'hint-force', 'Tu fuerza ' + mine.total + ' · Rival ' + theirs.total);
    const decisive = (duel[0].side === actor ? 1 : -1) * summary.decisive;
    const tone = decisive ? (decisive > 0 ? 'up' : 'down')
      : mine.total > theirs.total ? 'up' : mine.total < theirs.total ? 'down' : 'tie';
    span(hint, 'hint-status ' + tone, decisive > 0 ? 'Tu golpe decisivo gana'
      : decisive < 0 ? 'Golpe decisivo rival: solo otro lo anula' : status);
    const limit = rules.cardLimit(game, actor);
    span(hint, 'hint-rule', limit === 0 ? 'No puedes activar cartas' : 'Hasta ' + limit + (limit === 1 ? ' carta' : ' cartas'));
  } else hint.textContent = revealing ? 'Puedes activar hasta 2 cartas en este combate' : '3 cartas de reserva';
}
byId('drawer-close').addEventListener('click', () => {
  drawerOpen = false;
  privateHand = false;
  peeked = new Set();
  cardMenu = null;
  cardMenuNode.hidden = true;
  if (game) render();
});
function createDrawerButton(label, nextOpen, nextPrivate, className) {
  const control = button(actions, label, () => {
    if (game.phase === 'turn') clearRevealed();
    drawerOpen = nextOpen;
    privateHand = nextPrivate;
    render();
  }, className + ' drawer-toggle');
  control.setAttribute('aria-controls', 'hand-drawer');
  control.setAttribute('aria-expanded', String(nextOpen));
}
// Cartas vistas una a una con un toque, sin pulsar "Ver mis cartas".
let peeked = new Set();
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
  if (game) renderHands();
}
// Un toque fuera del menú y de la carta lo cancela.
document.addEventListener('pointerdown', event => {
  if (cardMenu === null || cardMenuNode.contains(event.target)) return;
  if (event.target.closest?.('.card[data-slot="' + cardMenu.slot + '"]')) return;
  closeCardMenu();
}, true);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeCardMenu(); });
function openCardMenu(node, side, slot, card) {
  cardMenu = { side, slot };
  cardMenuNode.replaceChildren();
  span(cardMenuNode, 'card-menu-title', rules.CARDS[card].name);
  span(cardMenuNode, 'card-menu-text', rules.CARDS[card].description);
  const row = document.createElement('div');
  row.className = 'card-menu-actions';
  cardMenuNode.append(row);
  button(row, 'Cancelar', closeCardMenu, 'secondary');
  const activate = button(row, 'Activar', () => {
    cardMenu = null;
    cardMenuNode.hidden = true;
    card === 'search' ? chooseSearch(slot) : play(slot, slot);
  }, 'primary');
  cardMenuNode.hidden = false;
  const rect = node.getBoundingClientRect();
  const width = cardMenuNode.offsetWidth;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
  cardMenuNode.style.left = left + 'px';
  cardMenuNode.style.top = Math.max(8, rect.top - cardMenuNode.offsetHeight - 10) + 'px';
  cardMenuNode.style.setProperty('--arrow', (rect.left + rect.width / 2 - left) + 'px');
  activate.focus();
}
function renderHands() {
  const revealing = game.phase === 'reveal';
  const actor = revealing ? rules.actor(game) : game.turn;
  let menuNode = null;
  for (const side of ['I', 'R']) {
    const hand = byId('hand-' + side);
    const seat = document.querySelector('.seat.' + (side === 'I' ? 'blue' : 'red'));
    seat.dataset.prompt = String(actor === side && ['turn', 'reveal'].includes(game.phase));
    hand.replaceChildren();
    const own = actor === side && !isAITurn() && ['turn', 'reveal'].includes(game.phase);
    for (let slot = 0; slot < rules.HAND_SIZE; slot++) {
      const face = shown[side].find(item => item.slot === slot);
      const card = face?.card ?? game.players[side].hand[slot];
      const visible = Boolean(face || (card && own && (privateHand || peeked.has(slot))));
      const canPlay = Boolean(revealing && own && card && !face && rules.playable(game, side, card));
      const node = document.createElement('button');
      node.type = 'button';
      node.dataset.slot = String(slot);
      node.className = 'card ' + (visible ? 'front' : card ? 'back' : 'empty');
      node.disabled = Boolean(face) || !card || !own || (visible && !canPlay);
      if (face) node.classList.add('played', ...(face.latest ? ['new'] : []));
      if (visible && canPlay) node.classList.add('ready');
      if (visible && !face && peeked.has(slot) && !privateHand) node.classList.add('peeked');
      if (visible) {
        const name = renderCardFace(node, card);
        node.setAttribute('aria-label', face ? 'Revelada: ' + name : canPlay ? name + '. Toca de nuevo para activar' : name);
      } else {
        if (!card) node.textContent = '—';
        node.setAttribute('aria-label', card ? 'Carta boca abajo ' + (slot + 1) + '. Toca para verla' : 'Sin carta');
      }
      if (!node.disabled) node.addEventListener('click', () => {
        if (busy()) return;
        if (!visible) {
          // Primer toque: voltear solo esta carta.
          peeked.add(slot);
          fx.play('deal');
          cardMenu = null;
          cardMenuNode.hidden = true;
          renderHands();
          return;
        }
        if (cardMenu?.slot === slot && cardMenu.side === side) closeCardMenu();
        else {
          renderHands();
          const fresh = byId('hand-' + side).querySelector('[data-slot="' + slot + '"]');
          fresh.classList.add('menu-open');
          openCardMenu(fresh, side, slot, card);
        }
      });
      if (cardMenu && cardMenu.side === side && cardMenu.slot === slot) {
        if (canPlay && visible) {
          node.classList.add('menu-open');
          menuNode = node;
        }
      }
      hand.append(node);
    }
  }
  if (cardMenu && !menuNode) {
    cardMenu = null;
    cardMenuNode.hidden = true;
  }
}
function nextTurn() {
  selection = null;
  clearSpecial();
  peeked = new Set();
  cardMenu = null;
  cardMenuNode.hidden = true;
  drawerOpen = false;
  privateHand = false;
  drawerOpen = false;
  lastRevealBattle = null;
  lastRevealSlot = -1;
  clearRevealed();
  battleResult = null;
  duel = null;
  started ??= Date.now();
  const previous = game.turn;
  if (!rules.nextTurn(game)) return;
  if (game.phase !== 'end') bannerQueue.push({ kind: 'endturn', title: 'FIN DEL TURNO', subtitle: 'Termina el turno de ' + rules.SIDE[previous] });
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
      say('Turno de ' + rules.SIDE[game.turn], game.actions === 2 ? 'Dos acciones completadas.'
        : selection ? 'Elige una casilla marcada.'
          : game.moved.length ? 'Movimiento usado. Puedes atacar.'
            : 'Un movimiento y un ataque por turno.');
      button(actions, 'Terminar turno', nextTurn, 'primary end-turn');
      createDrawerButton(drawerOpen ? 'Cerrar cartas' : 'Mis 3 cartas',
        !drawerOpen, !drawerOpen, 'secondary');
      if (selection && rules.specialOptions(game, selection).length) {
        const power = rules.SPECIALS[rules.piece(game, selection).animal];
        const toggle = button(actions, specialMode ? 'Cancelar ' + power.name : 'Ataque especial: ' + power.name, () => {
          specialMode = !specialMode;
          specialAt = null;
          render();
        }, (specialMode ? 'secondary' : 'primary') + ' special-toggle');
        toggle.setAttribute('aria-pressed', String(specialMode));
        if (specialMode) say(power.name, power.description + ' ' + (specialView().destinations.length && !specialAt
          ? 'Elige una casilla de destino o un objetivo marcado.' : 'Elige el objetivo marcado.'));
      }
      break;
    case 'reveal': {
      const side = rules.actor(game);
      const role = side === game.battle.defender ? 'Defensa' : 'Ataque';
      say(role + ' · ' + rules.SIDE[side], privateHand || peeked.size
        ? 'Toca una carta descubierta para activarla, o pasa.'
        : mode === 'ai' ? 'Toca una carta para verla y otra vez para activarla.'
          : 'Pasa el dispositivo al jugador indicado. Toca una carta para verla.');
      if (!privateHand) createDrawerButton('Ver todas', true, true, 'secondary');
      else createDrawerButton('Ocultar cartas', false, false, 'secondary');
      button(actions, 'Pasar', () => play(), 'secondary');
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
      say('Rescate de ' + rules.SIDE[game.rescue.side], selection
        ? 'Coloca a ' + selection + ' en una de tus casillas de despliegue libres.'
        : 'Elige la ficha que volverá al tablero como ficha normal.');
      game.pieces.filter(piece => !piece.cell && piece.side === game.rescue.side).forEach(piece =>
        button(actions, 'Rescatar a ' + animals[character(piece)] + ' ' + piece.id, () => { selection = piece.id; render(); }, 'primary'));
      button(actions, 'Guardar marcador', () => { rules.rescue(game, null); selection = null; render(); }, 'secondary');
      break;
    case 'end':
      say(game.winner ? 'Ganan los ' + rules.SIDE[game.winner].toLowerCase() : 'Empate',
        game.reason === 'eliminación' ? 'Partida decidida por las últimas fichas.' : 'Se completaron las 12 rondas.');
      break;
  }
}
// === Fuerza de combate visible ===
// Replica el cálculo de game.js con las cartas ya mostradas en pantalla,
// para que cada jugador vea cuánto suma o le restan antes de decidir.
let duelHold = false;
let duelPlayed = { I: [], R: [] };
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
function renderDuel() {
  const view = byId('duel');
  view.hidden = !duel || (game.phase !== 'reveal' && !duelHold);
  view.replaceChildren();
  if (view.hidden) return;
  const summary = forceSummary();
  const [attacker, defender] = duel;
  for (const [index, piece] of duel.entries()) {
    if (index === 1) span(view, 'duel-versus', 'VS');
    const portrait = document.createElement('div');
    portrait.className = 'duelist';
    portrait.dataset.side = piece.side;
    portrait.append(makeToken(piece));
    span(portrait, 'duelist-name', piece.cannon ? 'Cañón' : animals[character(piece)]);
    span(portrait, 'duelist-role', index === 0 ? 'Ataca' : 'Defiende');
    const force = index === 0 ? summary.a : summary.d;
    const meter = span(portrait, 'duel-force', '');
    meter.dataset.force = piece.side;
    span(meter, 'duel-force-label', 'Fuerza');
    span(meter, 'duel-force-value', String(force.total));
    const chips = span(portrait, 'force-chips', '');
    for (const part of force.parts) {
      if (part.label === 'Base') continue;
      const chip = span(chips, 'force-chip ' + (part.label === 'Base' ? 'base' : part.value > 0 ? 'up' : 'down'),
        (part.label === 'Base' ? part.value : signed(part.value)) + ' ' + part.label);
      chip.title = part.label;
    }
    if (force.decisive) span(chips, 'force-chip decisive', 'Golpe decisivo' + (force.decisive > 1 ? ' ×2' : ''));
    if (battleResult?.removed.includes(piece.id)) portrait.dataset.defeated = 'true';
    view.append(portrait);
  }
  const lead = summary.decisive ? (summary.decisive > 0 ? 0 : 1)
    : summary.a.total === summary.d.total ? -1 : summary.a.total > summary.d.total ? 0 : 1;
  view.dataset.lead = lead === -1 ? 'tie' : duel[lead].side;
  view.setAttribute('aria-label', pieceName(attacker) + ' contra ' + pieceName(defender));
}
function render() {
  if (game.phase === 'end' && ended === null) ended = Date.now();
  byId('round').textContent = 'Ronda ' + game.round + ' de 12';
  byId('active-side').textContent = game.phase === 'end' ? 'Partida terminada' : game.turn === 'I' ? 'Turno idealista' : mode === 'ai' ? 'Turno de la IA' : 'Turno realista';
  byId('blue-rescues').textContent = 'Rescates: ' + game.players.I.rescues;
  byId('red-rescues').textContent = 'Rescates: ' + game.players.R.rescues;
  byId('deck-I').textContent = game.players.I.deck.length;
  byId('deck-R').textContent = game.players.R.deck.length;
  // Barra de ataque especial: 3 segmentos que se llenan uno por turno propio.
  for (const side of ['I', 'R']) {
    const charge = game.players[side].charge;
    const bar = byId('charge-' + side);
    [...bar.children].forEach((segment, i) => segment.classList.toggle('full', i < charge));
    bar.classList.toggle('ready', charge >= rules.CHARGE_MAX);
    bar.setAttribute('aria-label', charge >= rules.CHARGE_MAX ? 'Ataque especial listo'
      : 'Ataque especial: ' + charge + ' de ' + rules.CHARGE_MAX);
  }
  const phase = byId('phase-indicator');
  phase.textContent = currentPhase();
  phase.dataset.phase = game.phase;
  byId('turn-info').textContent = game.phase === 'reveal' ? 'Carta o pase ' + (game.battle.slot + 1) + ' de 4'
    : game.phase === 'turn' ? 'Acciones: ' + game.actions + ' de 2' : '';
  const result = byId('battle-result');
  result.hidden = !battleResult;
  if (battleResult) {
    result.dataset.winner = battleResult.winner ?? '';
    result.textContent = (battleResult.decisiveCombo ? '¡COMBO DECISIVO! · '
      : battleResult.combos?.I || battleResult.combos?.R ? '¡COMBO +1! · '
        : battleResult.advantage ? 'Golpe decisivo · ' : '')
      + battleResult.force.join(' a ') + ' · ' + battleResult.text;
  }
  syncHandDrawer();
  renderBoard();
  renderHands();
  renderControls();
  byId('log').replaceChildren(...game.events.slice(-8).reverse().map(event => {
    const item = document.createElement('li');
    item.textContent = event.text;
    return item;
  }));
  // El duelo sigue a la vista mientras se animan las cartas de una batalla recién resuelta.
  duelHold = game.events.slice(announcedEvents).some(event => event.type === 'battle');
  renderDuel();
  announceNewEvents();
  // Los contadores de fichas cambian después de la explosión, no antes.
  if (!fxBusy) syncCounters();
  scheduleAI();
}
function syncCounters(pulse = false) {
  for (const [side, id] of [['I', 'blue'], ['R', 'red']]) {
    const node = byId(id);
    const value = String(rules.remaining(game, side));
    if (node.textContent === value) continue;
    node.textContent = value;
    if (pulse && !reducedMotion()) {
      node.classList.remove('count-drop');
      void node.offsetWidth;
      node.classList.add('count-drop');
    }
  }
}
function scheduleAI() {
  clearTimeout(aiTimer);
  aiTimer = null;
  if (!game || dialog.open || searchDialog.open || busy() || !isAITurn()) return;
  aiTimer = setTimeout(() => {
    aiTimer = null;
    if (!game || dialog.open || searchDialog.open || busy() || !isAITurn()) return;
    const action = ai.choose(rules, game, 'R');
    if (!action) return;
    switch (action.type) {
      case 'attack':
        startAttack(rules.piece(game, action.piece), rules.piece(game, action.target));
        return;
      case 'reveal': play(action.index, action.index, action.searchTarget ?? null); return;
      case 'combo': rules.comboEliminate(game, action.target); break;
      case 'nextTurn': nextTurn(); return;
      case 'move': rules.move(game, action.piece, action.cell); break;
      case 'rescue': rules.rescue(game, action.piece, action.cell); break;
      case 'special':
        startSpecial(rules.piece(game, action.piece), rules.piece(game, action.target), action.at);
        return;
      case 'skipBonus': rules.skipBonus(game); break;
    }
    render();
  }, game.phase === 'reveal' ? 650 : 440);
}
function resetPresentation() {
  clearTimeout(aiTimer);
  clearTimeout(bannerTimer);
  bannerQueue = [];
  bannerShowing = false;
  announcedEvents = 0;
  clearEffects();
  byId('phase-banner').hidden = true;
  if (searchDialog.open) searchDialog.close();
  drag?.ghost?.remove();
  drag = null;
  selection = null;
  privateHand = false;
  peeked = new Set();
  cardMenu = null;
  cardMenuNode.hidden = true;
  clearRevealed();
  battleResult = null;
  duel = null;
  duelPlayed = { I: [], R: [] };
  duelSpecial = null;
  duelHold = false;
  clearSpecial();
  started = null;
  ended = null;
}
function startGame(nextMode) {
  resetPresentation();
  mode = nextMode;
  game = rules.makeGame();
  byId('inicio').hidden = true;
  byId('partida').hidden = false;
  document.body.classList.add('playing');
  byId('history').hidden = false;
  byId('restart').hidden = false;
  byId('red-name').textContent = mode === 'ai' ? 'Realistas · IA' : 'Realistas';
  render();
  byId('phase-title').focus();
  window.scrollTo(0, 0);
}
function returnToMenu() {
  resetPresentation();
  game = null;
  mode = null;
  byId('inicio').hidden = false;
  byId('partida').hidden = true;
  document.body.classList.remove('playing');
  byId('history').hidden = true;
  byId('history').open = false;
  byId('restart').hidden = true;
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
byId('restart').addEventListener('click', () =>
  confirmRestart('¿Empezar otra partida?', 'Nueva partida', () => startGame(mode)));
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
