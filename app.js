'use strict';

const rules = window.RealesIdeales;
const hudArt = name => 'assets/ui/hud/' + name + '.png';
const searchArt = hudArt('lupa') + '?v=041';
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
const characterArt = (side, animal) => `assets/clay/fichas/${tokenFaction[side]}-${animal}.webp`;
const cannonArt = { I: 'assets/v014/canon-idealista.webp', R: 'assets/v014/canon.webp' };
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
let visibleCoins = { I: 0, R: 0 };
let duel = null;
let combatIntro = false;
let hudNotice = '';
let hudNoticeTimer = null;
let decisivePlaying = false;
let started = null;
let ended = null;
let announcedEvents = 0;
const matchIntro = byId('match-intro');
const matchCue = matchIntro.querySelector('[role="status"]');
let introTimer = null;
const searchDialog = byId('search-choice');
const rescueDialog = byId('rescue-dialog');
const controls = actions.closest('.controls');
// === Ajustes del jugador (se guardan en este navegador) ===
const SETTINGS_KEY = 'reales-ideales-ajustes';
const settings = { timer: 'normal', speed: 1, board: 'andes', coverMotion: 'on' };
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

function announceNewEvents(events) {
  announcedEvents = game.events.length;
  if (!startEventEffects(events)) finishCombatIntro();
}
function startEventEffects(events) {
  const duration = playEffects(events);
  if (!(duration > 0)) return false;
  fxBusy = true;
  document.body.classList.add('fx-busy');
  clearTimeout(fxBusyTimer);
  fxBusyTimer = setTimeout(releaseEffects, duration / settings.speed);
  return true;
}
function releaseEffects() {
  fxBusy = false;
  fxBusyTimer = null;
  document.body.classList.remove('fx-busy');
  if (!game) return;
  if (displayedPieces) {
    displayedPieces = null;
    renderBoard();
  }
  visibleCoins = { I: game.players.I.coins, R: game.players.R.coins };
  renderCoins();
  syncCounters();
  maybeShowEnd();
  if (duelHold) {
    duelHold = false;
    renderDuel();
  }
  finishCombatIntro();
  renderHudStatus();
  scheduleProgress();
}
function finishCombatIntro() {
  if (!combatIntro || fxBusy) return;
  combatIntro = false;
  document.body.classList.remove('combat-intro');
  if (game?.phase === 'reveal') { renderDuel(); syncTimer(); layoutScene(); }
}
// La partida espera mientras se muestran efectos o una opción del menú.
function busy() {
  return introTimer !== null || fxBusy || matchDialogs.some(node => node.open);
}

// === Efectos visuales y sonoros ===
// Los efectos se derivan del motor y el HUD conserva las instrucciones de juego.
const fx = window.RealesIdealesFX;
const fxLayer = byId('fx-layer');
// Partículas WebGL (PixiJS). Sin WebGL, cada llamada es inofensiva y quedan los efectos CSS.
const cfx = window.RealesIdealesCombatFX ?? new Proxy({}, { get: () => () => {} });
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
let previousPieces = null;
let displayedPieces = null;
const movingPieces = new Set();
const boardEffectTypes = new Set(['move', 'bonus', 'advance', 'leap', 'battle', 'combo', 'double', 'summon', 'rescue']);
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
  movingPieces.clear();
  decisivePlaying = false;
  previousPieces = null;
  displayedPieces = null;
  fxLayer.replaceChildren();
  cfx.clear();
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
function displayedPiece(id) {
  return displayedPieces ? displayedPieces.get(id) : rules.piece(game, id);
}
function pieceCell(id) {
  return displayedPiece(id)?.cell ?? null;
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
function tokenFrame(cell) {
  const point = cellPoint(cell);
  if (!point) return null;
  const { w, h } = sceneGeometry.cells[cell];
  const size = point.size * TOKEN_SCALE;
  return { x: point.x, y: point.y + point.size * h / w * .2 - size / 2, width: size, height: size };
}
// Réplica de una ficha sobre la capa de efectos durante su animación.
function tokenClone(piece, point, className, life) {
  if (!point) return null;
  const node = spawn(className, { ...point, size: 0 }, { w: point.width + 'px', h: point.height + 'px' }, life);
  if (node) node.append(makeToken(piece));
  return node;
}
const DRIVE_MS = 900;
const KNOCKOUT_MS = 1100;
const KNOCKOUT_STAGGER_MS = 170;
const DECISIVE_PREP_MS = 820;
const DECISIVE_FREEZE_MS = 420;
const decisiveLead = () => reducedMotion() ? 260 : DECISIVE_PREP_MS + DECISIVE_FREEZE_MS;
// Desplazamiento tipo camioncito: avanza a tumbos, levanta polvo y suena el motor.
function drive(event) {
  const piece = displayedPiece(event.piece);
  if (!piece) return;
  const from = tokenFrame(event.from), to = tokenFrame(event.to);
  fx.play('drive', DRIVE_MS / 1000);
  const vehicle = from && to && !reducedMotion() ? tokenClone(piece, from, 'fx-vehicle', DRIVE_MS + 300) : null;
  if (vehicle) {
    vehicle.style.setProperty('--dx', (to.x - from.x) + 'px');
    vehicle.style.setProperty('--dy', (to.y - from.y) + 'px');
    vehicle.style.setProperty('--end-scale', String(to.width / from.width));
    vehicle.style.setProperty('--tilt', (to.x >= from.x ? 5 : -5) + 'deg');
    movingPieces.add(piece.id);
    renderBoard();
    for (let i = 0; i < 4; i++) later(i * DRIVE_MS / 4, () => {
      const t = i / 4;
      spawn('fx-dust small', { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t + from.height * .35, size: from.width * .5 }, {}, 650);
    });
  }
  later(DRIVE_MS, () => {
    displayedPieces?.set(piece.id, { ...piece, cell: event.to });
    movingPieces.delete(piece.id);
    renderBoard();
    vehicle?.remove();
    cfx.dust(cellPoint(event.to), 12);
    fx.play('ok');
    speech(event.to, '¡Ok!', piece.side, 950);
  });
}
function defeatPiece(id, big, attackerSide, decisive = false) {
  const piece = displayedPiece(id);
  if (!piece) return;
  const cell = piece.cell;
  const point = cellPoint(cell);
  if (point) {
    cfx.impact({ ...point, y: point.y - point.size * .1 }, piece.side, decisive ? 4 : big ? 2 : 1);
    const ko = tokenClone(piece, tokenFrame(cell), decisive && !reducedMotion() ? 'fx-ko fx-ko-shatter' : 'fx-ko', KNOCKOUT_MS);
    ko?.style.setProperty('--dir', attackerSide === 'R' || (!attackerSide && piece.side === 'I') ? '-1' : '1');
    if (ko?.classList.contains('fx-ko-shatter')) {
      const token = ko.firstElementChild;
      for (let i = 1; i < 4; i++) ko.append(token.cloneNode(true));
    }
  }
  // El cuerpo animado sustituye a la ficha en el mismo fotograma del impacto.
  displayedPieces?.delete(id);
  renderBoard();
  spawn('fx-explosion' + (big ? ' big' : ''), point, {}, 1200);
  spawn('fx-shockwave', point, {}, 900);
  if (!reducedMotion()) for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.random() * .4;
    const reach = (point?.size ?? 60) * (0.8 + Math.random() * 0.6);
    spawn('fx-debris', point, { dx: Math.cos(angle) * reach + 'px', dy: Math.sin(angle) * reach + 'px' }, 900);
  }
}
function decisiveImpact(event) {
  const target = displayedPiece(event.removed[0]);
  const victor = displayedPiece(duel?.find(piece => piece.side === event.winner)?.id);
  const to = tokenFrame(target?.cell), from = tokenFrame(victor?.cell);
  const impactDelay = decisiveLead();
  if (!to || !from) return impactDelay;
  const reduced = reducedMotion();
  decisivePlaying = true;
  renderHudStatus();
  fx.duck(.16);
  fx.play('charge');
  const panel = spawn('fx-decisive-focus', { x: 0, y: 0, size: 0 }, {
    x: (to.x + from.x) / 2 + 'px', y: (to.y + from.y) / 2 + 'px',
    radius: Math.max(100, Math.hypot(to.x - from.x, to.y - from.y) / 2 + to.width * .8) + 'px',
  }, impactDelay + 240);
  const mark = () => {
    spawn('fx-decisive-crack', { x: to.x, y: to.y, size: to.width * 3.3 }, {}, reduced ? 580 : 920);
    fx.play('decisive');
  };
  if (reduced) { mark(); return impactDelay; }

  const focus = tokenClone(target, to, 'fx-decisive-target', impactDelay + 150);
  movingPieces.add(target.id);
  if (event.nearby) {
    const striker = tokenClone(victor, from, 'fx-decisive-striker', impactDelay + 360);
    striker.style.setProperty('--dx', (to.x - from.x) * .67 + 'px');
    striker.style.setProperty('--dy', (to.y - from.y) * .67 + 'px');
    movingPieces.add(victor.id);
    later(impactDelay + 260, () => {
      movingPieces.delete(victor.id);
      renderBoard();
      striker.remove();
    });
  } else {
    const shot = spawn('fx-decisive-shot', { x: from.x, y: from.y, size: 23 }, {
      dx: to.x - from.x + 'px', dy: to.y - from.y + 'px',
    }, impactDelay);
    later(impactDelay, () => shot.remove());
  }
  renderBoard();
  later(DECISIVE_PREP_MS, () => {
    panel.classList.add('freeze');
    mark();
  });
  later(impactDelay, () => {
    movingPieces.delete(target.id);
    focus.remove();
  });
  return impactDelay;
}
const SHOT_DELAY = 220, SHOT_FLIGHT = 720;
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
  const piece = displayedPiece(event.piece);
  const power = rules.FIRE_POWER;
  const style = powerStyles[event.animal] ?? powerStyles.tigrillo;
  fx.play('special');
  if (point) {
    spawn('fx-spotlight', { x: 0, y: 0, size: 0 }, { x: point.x + 'px', y: point.y + 'px', r: point.size * .7 + 'px' }, SPECIAL_MS);
    spawn('fx-power-aura side-' + event.side, point, { color: style.color, glow: style.glow }, SPECIAL_MS);
    if (piece) tokenClone(piece, tokenFrame(piece.cell), 'fx-hero', SPECIAL_MS);
    if (!reducedMotion()) for (let i = 0; i < 26; i++) {
      const angle = Math.random() * Math.PI * 2;
      const reach = point.size * (1.2 + Math.random() * 1.6);
      spawn('fx-particle shape-' + style.shape, point, {
        dx: Math.cos(angle) * reach + 'px', dy: Math.sin(angle) * reach + 'px',
        delay: Math.round(Math.random() * 700) + 'ms', color: style.color, glow: style.glow,
      }, SPECIAL_MS);
    }
  }
  cfx.fireCharge(point, SPECIAL_MS);
  later(SPECIAL_MS * .55, () => cfx.fireBurst(point, 30));
  numberAt(point, signed(power.bonus), 'up');
  const title = point && spawn('fx-power-name fx-power-local side-' + event.side,
    { ...point, x: Math.max(75, Math.min(window.innerWidth - 75, point.x)), y: point.y - point.size * .65 },
    { color: style.color, glow: style.glow }, SPECIAL_MS);
  if (title) span(title, 'fx-power-title', event.power);
  later(SPECIAL_MS * .55, () => { if (!reducedMotion()) shake(); });
}
function attackSequence(event) {
  const fromCell = pieceCell(event.piece), toCell = pieceCell(event.target);
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
    cfx.sparks(to, 14, .8); cfx.dust(to, 8);
    spawn('fx-impact', to, {}, 700);
    spawn('fx-lock', to, {}, 1400);
    fx.play('explosion');
    shake();
  });
}
// Cada activación o pase entra directamente en su espacio, sin ventana central.
const SHOWCASE_MS = 1400;
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
// Efectos sobre la ficha que actúa, nunca sobre el centro del tablero ni el marcador.
function fighterPoint(side) {
  const fighter = duel?.find(p => p.side === side);
  return fighter ? cellPoint(fighter.cell ?? pieceCell(fighter.id)) : null;
}
function numberAt(point, text, kind) {
  if (!point) return;
  const node = spawn('fx-number ' + kind, { ...point, y: point.y - point.size * .24 }, {}, 1400);
  if (node) node.textContent = text;
}
function floatNumber(side, text, kind) {
  numberAt(fighterPoint(side),text,kind);
}
function cardAura(side, card, kind) {
  const point = fighterPoint(side);
  if (!point) return;
  const [color, glow] = cardColors[card];
  spawn('fx-local-card ' + kind, point, { color, glow }, 1050);
}
// === Cartas legibles en combate ===
// El dueño de la carta brilla con el color de su bando, la carta aparece junto a él con su
// nombre y viaja hasta la ficha afectada; el número sale al costado de esa ficha (nunca
// entre las dos) con un anillo del color de la carta.
const CARD_THROW_MS = 1300;
const SIDE_ADJ = { I: 'idealista', R: 'realista' };
function fighterOf(side) { return duel?.find(p => p.side === side) ?? null; }
function besidePoint(side) {
  const point = fighterPoint(side), other = fighterPoint(side === 'I' ? 'R' : 'I');
  if (!point) return null;
  let dir = other ? Math.sign(point.x - other.x) : 0;
  if (!dir || Math.abs(point.x - other.x) < point.size * .3) dir = side === 'I' ? 1 : -1;
  const x = Math.max(36, Math.min(window.innerWidth - 36, point.x + dir * point.size * .62));
  return { ...point, x, y: point.y - point.size * .55 };
}
function cardThrow(ownerSide, card, effects) {
  const owner = fighterPoint(ownerSide), fighter = fighterOf(ownerSide);
  if (!owner || !fighter) { effects.forEach(e => floatNumber(e.side, e.label, e.kind)); return; }
  const [color] = cardColors[card];
  const reduced = reducedMotion();
  spawn('fx-owner-ring side-' + ownerSide, owner, {}, 900);
  // Carta junto al dueño, del mismo lado que sus ranuras de combate (realistas a la
  // izquierda, idealistas a la derecha) y siempre dentro de la pantalla.
  const dir = ownerSide === 'I' ? 1 : -1;
  const holdX = Math.max(70, Math.min(window.innerWidth - 70, owner.x + dir * owner.size * 1.25));
  const holdY = Math.max(110, owner.y - owner.size * .9);
  const node = spawn('fx-thrown side-' + ownerSide, { x: holdX, y: holdY, size: 0 }, { color }, CARD_THROW_MS);
  if (node) {
    span(node, 'fx-thrown-owner', animals[character(fighter)] + ' ' + SIDE_ADJ[ownerSide]);
    const face = span(node, 'card front fx-thrown-card', '');
    renderCardFace(face, card);
  }
  const main = effects[0];
  const target = main ? fighterPoint(main.side) : owner;
  if (node && target && !reduced) {
    later(780, () => {
      node.style.setProperty('--tx', (target.x - holdX) + 'px');
      node.style.setProperty('--ty', (target.y - holdY) + 'px');
      node.classList.add('travel');
      for (let i = 0; i < 6; i++) later(i * 45, () => cfx.trail({ ...owner, x: holdX + (target.x - holdX) * i / 6, y: holdY + (target.y - holdY) * i / 6 }, parseInt(color.slice(1), 16)));
    });
  }
  later(reduced ? 400 : 1080, () => {
    for (const e of effects) {
      const point = fighterPoint(e.side);
      if (!point) continue;
      spawn('fx-hit-ring', point, { color }, 900);
      cfx.cardHit(point, parseInt(color.slice(1), 16));
      numberAt(besidePoint(e.side), e.label, e.kind);
      cardAura(e.side, card, e.kind);
    }
  });
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
  const rule = rules.CARDS[card];
  const effects = [];
  if (card === 'decisive') effects.push({ side, label: 'Decisivo', kind: 'decisive' });
  else if (rule.own) effects.push({ side, label: signed(rule.own), kind: 'up' });
  if (rule.rival) effects.push({ side: rivalSide, label: signed(rule.rival), kind: 'down' });
  cardThrow(side, card, effects);
  for (const [i, delta] of [[index, own], [1 - index, rival]]) {
    if (!delta) continue;
    const value = byId('duel').querySelector('[data-force="' + duel[i].side + '"] .duel-force-value');
    value?.classList.add(delta > 0 ? 'bump-up' : 'bump-down');
  }
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
    case 'combo-card': {
      fx.play('combo');
      const point = fighterPoint(event.side);
      if (point) spawn('fx-local-card combo', point, { color: '#ecc75c', glow: '#fff0a0' }, 1100);
      floatNumber(event.side, '+1', 'up');
      return;
    }
    case 'reward':
      numberAt(cellPoint(event.cell), '+' + event.amount + ' monedas', 'coins');
      visibleCoins[event.side] += event.amount;
      renderCoins();
      return;
    case 'battle': {
      const big = event.decisiveWin || event.decisiveCombo || Math.abs(event.force[0] - event.force[1]) >= 3;
      // El duelo se retira justo antes de la explosión para no tapar las fichas.
      duelHold = false;
      renderDuel();
      const lead = event.decisiveWin ? decisiveImpact(event) : 0;
      const impact = () => {
        event.removed.length > 1 ? fx.play('draw') : fx.play('explosion', big);
        event.removed.forEach((id, i) => {
          const defeat = () => defeatPiece(id, big, event.winner, event.decisiveWin);
          if (i) later(i * KNOCKOUT_STAGGER_MS, defeat);
          else defeat();
        });
        if (event.winner && !reducedMotion()) flash(event.winner === 'I' ? '#235f82' : '#9d312f', '#ffe3a3');
        shake(big || event.removed.length > 1);
      };
      if (lead) later(lead, impact);
      else impact();
      later(lead + knockoutDuration(event), () => {
        if (lead) { decisivePlaying = false; fx.duck(1); renderHudStatus(); }
        syncCounters(true);
      });
      return;
    }
    case 'double-ready':
      fx.play('combo');
      flash('#9d312f', '#ffe3a3');
      return;
    case 'double':
    case 'combo':
      fx.play('explosion', true);
      defeatPiece(event.target, true, event.side);
      later(KNOCKOUT_MS, () => syncCounters(true));
      shake(true);
      return;
    case 'summon': {
      const piece = displayedPiece(event.piece);
      if (piece && displayedPieces) {
        displayedPieces.set(piece.id, { ...piece, cannon: true });
        renderBoard();
      }
      fx.play('summon');
      spawn('fx-summon', cellPoint(event.cell), {}, 1300);
      return;
    }
    case 'rescue': {
      const piece = rules.piece(game, event.piece);
      if (piece && displayedPieces) {
        displayedPieces.set(piece.id, { ...piece });
        renderBoard();
      }
      fx.play('rescue');
      spawn('fx-rescue', cellPoint(event.to), {}, 1300);
      speech(event.to, '¡Ok!', event.side, 950);
      return;
    }
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
// Cada evento conserva su turno visual antes del siguiente.
const fxDurations = { move: DRIVE_MS + 800, bonus: DRIVE_MS + 800, advance: DRIVE_MS + 800,
  attack: SHOT_DELAY + SHOT_FLIGHT + 230, reveal: SHOWCASE_MS, pass: 340, 'combo-card': 480,
  combo: KNOCKOUT_MS + 60, double: KNOCKOUT_MS + 60, 'double-ready': 700, summon: 1100, rescue: 1100,
  reward: 700, 'time-cannon': SHOT_FLIGHT + 500, end: 1400, special: SPECIAL_MS, leap: DRIVE_MS + 300 };
const knockoutDuration = event => KNOCKOUT_MS + (event.removed.length - 1) * KNOCKOUT_STAGGER_MS;
function playEffects(events) {
  let delay = 0;
  for (const event of events) {
    if (delay) later(delay, () => effectFor(event));
    else effectFor(event);
    delay += event.type === 'battle'
      ? knockoutDuration(event) + (event.decisiveWin ? decisiveLead() : 0) + 60
      : (fxDurations[event.type] ?? 0);
  }
  return delay;
}
const settingsDialog = byId('settings');
const settingsForm = settingsDialog.querySelector('form');
const gameMenu = byId('game-menu');
const helpDialog = byId('help-dialog');
const historyDialog = byId('history');
const coinDialog = byId('coin-dialog');
const cardMenuNode = byId('card-menu');
const characterDialog = byId('character-dialog');
const matchDialogs = [gameMenu, helpDialog, historyDialog, settingsDialog, coinDialog, cardMenuNode, characterDialog];
byId('coin-button').addEventListener('click', () => { if (game && !busy()) { renderCoins(); coinDialog.showModal(); } });
const gameMenuButton = byId('game-menu-button');
const playMenu = byId('play-menu');
const playOptions = byId('play-options');
const cover = byId('inicio');
const coverVideo = byId('cover-video');
const animatedCover = window.matchMedia('(orientation: portrait) and (prefers-reduced-motion: no-preference)');
function syncCoverVideo() {
  const enabled = settings.coverMotion === 'on' && animatedCover.matches && !navigator.connection?.saveData;
  coverVideo.hidden = !enabled;
  if (!enabled || cover.hidden || document.hidden) {
    coverVideo.pause();
    return;
  }
  if (!coverVideo.hasAttribute('src')) coverVideo.src = coverVideo.dataset.src;
  if (coverVideo.paused) coverVideo.play().catch(() => {});
}
coverVideo.addEventListener('playing', () => coverVideo.classList.add('ready'));
coverVideo.addEventListener('error', () => coverVideo.classList.remove('ready'));
animatedCover.addEventListener?.('change', syncCoverVideo);
document.addEventListener('visibilitychange', syncCoverVideo);
const seats = [...document.querySelectorAll('.seat')];
let handOwner = null;
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
    timer: settings.timer, speed: String(settings.speed), board: settings.board, coverMotion: settings.coverMotion };
  for (const [name, value] of Object.entries(values))
    settingsForm.querySelector('input[name="' + name + '"][value="' + value + '"]').checked = true;
}
function openSettings() {
  syncSettingsForm();
  byId('cover-motion-setting').hidden = cover.hidden;
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
  if (name === 'speed') { settings.speed = Number(value); cfx.setSpeed(settings.speed); }
  if (name === 'board') {
    settings.board = value;
    applyBoardTheme();
  }
  if (name === 'coverMotion') { settings.coverMotion = value; syncCoverVideo(); }
  saveSettings();
});
for (const node of matchDialogs) {
  node.addEventListener('close', () => { if (game) scheduleProgress(); });
}
function renderCardFace(parent, card, preview = false) {
  parent.classList.add('illustrated');
  parent.dataset.card = card;
  const title = span(parent, 'card-title', rules.CARDS[card].name);
  const art = span(parent, 'card-art', '');
  art.setAttribute('aria-hidden', 'true');
  if (card === 'search') {
    const icon = document.createElement('img');
    icon.src = searchArt;
    icon.alt = '';
    art.append(icon);
    span(art, 'search-card-label', title.textContent);
  }
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
  image.src = piece.cannon ? cannonArt[piece.side] : characterArt(piece.side, character(piece));
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
  const art = theme.art();
  board.prepend(art);
  if (game && art instanceof HTMLVideoElement && !reducedMotion()) art.play().catch(() => {});
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
    const dockTop = controls.getBoundingClientRect().top;
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
    // Globo arriba y a la derecha de la cabeza de la llama alada.
    // Su cola inferior izquierda señala al personaje; el globo queda dentro del visor.
    const clock = byId('match-clock');
    const rect = board.getBoundingClientRect();
    const halfW = clock.offsetWidth / 2, halfH = clock.offsetHeight / 2;
    const cx = vw - halfW - 8;
    const cy = rect.top + rect.height * .145;
    const safeRight = vw - halfW - 8;
    const minX = Math.min(safeRight, Math.max(halfW + 8, heading.getBoundingClientRect().right + halfW + 6));
    const safeTop = Math.max(...seats.map(seat => seat.getBoundingClientRect().bottom)) + halfH + 8;
    const safeBottom = Math.max(halfH + 8, Math.min(vh - halfH - 8, top * scale + y - halfH - 12));
    clock.style.setProperty('--clock-x', Math.max(minX, Math.min(safeRight, cx)) + 'px');
    clock.style.setProperty('--clock-y', Math.max(Math.min(safeTop, safeBottom), Math.min(safeBottom, cy)) + 'px');
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
sceneResize.observe(byId('active-side').closest('.field-heading'));
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
  const positions = displayedPieces && new Map([...displayedPieces.values()].map(piece => [piece.cell, piece]));
  const ready = specialReadyPieces();
  const special = specialView();
  const moves = special ? special.destinations : selection ? rules.moves(game, selection) : [];
  const targets = special ? special.targets : selection ? rules.attacks(game, selection) : [];
  for (const [cell, hex] of hexButtons) {
    const piece = positions ? positions.get(cell) : rules.occupant(game, cell);
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
      token.dataset.tokenCell = cell;
      if (drag?.ghost && drag.id === piece.id) token.classList.add('origin');
      if (movingPieces.has(piece.id)) token.classList.add('fx-pending');
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
function dragCellAt(event, ignorePiece = null) {
  const { clientX: x, clientY: y } = event;
  const target = document.elementFromPoint(x, y);
  if (!board.contains(target)) return null;
  let hit = null;
  let nearest = Infinity;
  for (const token of tokenLayer.children) {
    if (token.dataset.piece === ignorePiece) continue;
    const rect = token.getBoundingClientRect();
    const dx = (x - (rect.left + rect.width / 2)) / rect.width;
    const dy = (y - (rect.top + rect.height / 2)) / rect.height;
    const distance = dx ** 2 + dy ** 2;
    if (distance < .18 && distance < nearest) {
      hit = token.dataset.tokenCell;
      nearest = distance;
    }
  }
  return hit ?? target.closest('[data-cell]')?.dataset.cell ?? null;
}
board.addEventListener('pointerdown', event => {
  suppressClick = false;
  if (!game || isAITurn() || specialMode || dialog.open || searchDialog.open || busy() || !event.isPrimary || event.button !== 0) return;
  const cell = dragCellAt(event);
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
  const cell = cancelled ? null : dragCellAt(event, id);
  renderBoard();
  if (cell) proposeDestination(id, cell);
}
board.addEventListener('pointerup', stopDrag);
board.addEventListener('pointercancel', event => stopDrag(event, true));
board.addEventListener('lostpointercapture', event => {
  // En táctil, la casilla cede su captura implícita al tablero al iniciar el arrastre.
  if (event.target === board) stopDrag(event, true);
});
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
const cardPreviewArt = byId('card-preview-art');
const cardPreviewPlay = byId('card-preview-play');
function closeCardMenu() {
  cardMenu = null;
  if (cardMenuNode.open) cardMenuNode.close();
}
byId('card-preview-close').addEventListener('click', closeCardMenu);
cardMenuNode.addEventListener('close', () => { if (!cardMenuNode.open) cardMenu = null; });
cardMenuNode.addEventListener('click', event => {
  if (event.target !== cardMenuNode) return;
  const rect = cardMenuNode.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeCardMenu();
});
cardPreviewPlay.addEventListener('click', () => {
  if (!cardMenu || cardPreviewPlay.disabled) return;
  const { side, slot, card } = cardMenu;
  closeCardMenu();
  if (busy() || game?.phase !== 'reveal' || rules.actor(game) !== side || game.players[side].hand[slot] !== card) return;
  if (card === 'search') chooseSearch(slot);
  else play(slot);
});
function openCardMenu(side, slot, card) {
  cardMenu = { side, slot, card };
  cardPreviewArt.replaceChildren();
  renderCardFace(cardPreviewArt, card);
  byId('card-preview-title').textContent = rules.CARDS[card].name;
  byId('card-preview-text').textContent = rules.CARDS[card].description;
  cardPreviewPlay.disabled = game.phase !== 'reveal' || isAITurn() || !rules.playable(game, side, card);
  cardMenuNode.showModal();
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
      openCardMenu(side, slot, card);
    }, 'hud-card');
    node.dataset.slot = String(slot);
    node.disabled = !card;
    node.title = card ? rules.CARDS[card].name : 'Casilla vacía';
    node.setAttribute('aria-label', node.title);
    if (!card) continue;
    const icon = document.createElement('img');
    icon.src = card === 'search' ? searchArt : 'assets/clay/emblemas/' + card + '.webp';
    icon.alt = '';
    node.append(icon);
  }
}
function nextTurn() {
  selection = null;
  clearSpecial();
  closeCardMenu();
  // El resultado queda sobre el dock hasta el próximo combate.
  duel = null;
  if (!rules.nextTurn(game)) return;
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
      const arrow = document.createElement('img');
      arrow.className = 'hud-icon';
      arrow.src = hudArt('fin-turno');
      arrow.alt = '';
      end.append(arrow);
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
const playedCardOrder = ['boost','weaken','major','decisive','cannon'];
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
// Cuenta solo durante las decisiones humanas.
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
  closeCardMenu();
  fx.play('pass');
  showHudNotice('Tiempo agotado');
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

function drawMatchClock(seconds) {
  const clock = byId('match-clock');
  const label = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  const value = byId('match-clock-value');
  if (value.textContent !== label) {
    value.textContent = label;
    clock.dateTime = 'PT' + seconds + 'S';
    clock.setAttribute('aria-label', 'Faltan ' + Math.floor(seconds / 60) + ' minutos y ' + seconds % 60 + ' segundos');
  }
}
function updateMatchClock() {
  if (!game || game.phase === 'end' || !matchDeadline) return false;
  const seconds = Math.max(0, Math.ceil((matchDeadline - Date.now()) / 1000));
  drawMatchClock(seconds);
  if (seconds > 0 || fxBusy || combatIntro) return false;
  if (!rules.finishOnTime(game)) return false;
  visibleCoins = { I: game.players.I.coins, R: game.players.R.coins };
  ended = matchDeadline;
  clearTimeout(progressTimer);
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
  if (!game || game.phase !== 'end' || endShown || fxBusy) return;
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
    ['Monedas ganadas', s => game.players[s].coins],
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
byId('stats-again').addEventListener('click', () => chooseCharacters(mode));
byId('stats-menu').addEventListener('click', returnToMenu);
byId('stats-export').addEventListener('click', () => byId('export').click());

function renderCoins() {
  for (const side of ['R','I']) byId('coins-' + side).textContent = String(visibleCoins[side]);
  const side = mode === 'local' && game ? (ai.decisionSide(game,rules) ?? game.turn) : 'I';
  const current = byId('coin-current');
  current.textContent = String(visibleCoins[side]);
  current.dataset.side = side;
  current.setAttribute('aria-label', 'Monedas de ' + rules.SIDE[side] + ': ' + visibleCoins[side]);
}
function renderHudStatus() {
  const hint = byId('special-hint'), result = byId('battle-result'), instructions = byId('instructions');
  const notice = byId('hud-notice');
  const message = decisivePlaying ? 'Golpe decisivo' : combatIntro
    ? (mode === 'ai' && game.battle?.attacker === 'R' ? 'Defiéndete…' : 'Ataque en curso…')
    : hudNotice;
  notice.hidden = !message;
  if (notice.textContent !== message) notice.textContent = message;
  const hasHint = !hint.hidden;
  const showResult = Boolean(!message && battleResult && !fxBusy && game.phase === 'turn' && !selection && !hasHint);
  result.hidden = !showResult;
  instructions.hidden = Boolean(message) || hasHint || showResult;
  if (!instructions.hidden && game.phase === 'turn' && !selection && !isAITurn() && !shouldAutoEndTurn()) {
    instructions.textContent = game.moved.length ? 'Puedes atacar.' : game.attacked ? 'Puedes mover.' : 'Elige una ficha.';
  }
}
function showHudNotice(message) {
  clearTimeout(hudNoticeTimer);
  hudNotice = message;
  hudNoticeTimer = setTimeout(() => {
    hudNotice = '';
    if (game) renderHudStatus();
  }, 1500);
}
function render() {
  const newEvents = game.events.slice(announcedEvents);
  // El motor aplica el resultado de inmediato. El tablero conserva la escena
  // anterior hasta que cada evento de movimiento, invocación o derrota se presenta.
  if (previousPieces && newEvents.some(event => boardEffectTypes.has(event.type))) {
    displayedPieces = previousPieces;
  }
  previousPieces = new Map(game.pieces.filter(piece => piece.cell).map(piece => [piece.id, { ...piece }]));
  renderCoins();
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
  duelHold ||= newEvents.some(event => event.type === 'battle');
  renderDuel();
  if (introTimer === null) announceNewEvents(newEvents);
  renderHudStatus();
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
  group.hidden = false;
  const state = rules.turnActions(game);
  for (const [action, label] of [['move', 'Mover'], ['attack', 'Atacar']]) {
    const node = byId(action + '-status');
    const status = game.phase === 'turn' ? state[action] : 'waiting';
    const descriptions = { ready: 'disponible', waiting: 'no disponible', spent: 'ya usado en este turno' };
    node.dataset.state = status;
    node.title = label + ': ' + descriptions[status];
    node.setAttribute('aria-label', node.title);
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
  clearMatchIntro();
  visibleCoins = { I: 0, R: 0 };
  clearTimeout(progressTimer);
  announcedEvents = 0;
  clearTimeout(hudNoticeTimer);
  hudNotice = '';
  clearEffects();
  if (searchDialog.open) searchDialog.close();
  if (rescueDialog.open) rescueDialog.close();
  combatIntro = false;
  document.body.classList.remove('combat-intro');
  drag?.ghost?.remove();
  drag = null;
  selection = null;
  closeCardMenu();
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
function clearMatchIntro() {
  clearTimeout(introTimer);
  introTimer = null;
  delete matchIntro.dataset.cue;
  matchCue.textContent = '';
  byId('partida').inert = false;
}
function showMatchIntro() {
  const field = byId('partida');
  field.inert = true;
  matchIntro.dataset.cue = 'ready';
  matchCue.textContent = '¡Listos!';
  fx.play('tick');
  introTimer = setTimeout(() => {
    matchIntro.dataset.cue = 'go';
    matchCue.textContent = '¡Ya!';
    fx.play('turn', game.turn);
    announcedEvents = game.events.length;
    introTimer = setTimeout(() => {
      clearMatchIntro();
      started = Date.now();
      matchDeadline = started + MATCH_DURATION_MS;
      timerKey = null;
      syncTimer();
      scheduleProgress();
      field.focus({ preventScroll: true });
    }, 700);
  }, 1250);
}
function startGame(nextMode, characters) {
  resetPresentation();
  cfx.start();
  cfx.setSpeed(settings.speed);
  fx.music('battle');
  if (!sceneGeometry) applyBoardTheme();
  const video = board.querySelector('.board-video');
  if (video && !reducedMotion()) video.play().catch(() => {});
  mode = nextMode;
  game = rules.makeGame();
  game.characters = characters;
  for (const [side, animal] of Object.entries(game.characters)) {
    const avatar = byId('avatar-' + side);
    avatar.src = characterArt(side, animal);
    avatar.alt = animals[animal] + ' ' + SIDE_ADJECTIVE[side];
  }
  handOwner = 'I';
  byId('match-clock').hidden = false;
  drawMatchClock(MATCH_DURATION_MS / 1000);
  cover.hidden = true;
  syncCoverVideo();
  byId('partida').hidden = false;
  document.body.classList.add('playing');
  layoutScene();
  gameMenuButton.hidden = false;
  byId('red-ai').hidden = mode !== 'ai';
  showMatchIntro();
  render();
  window.scrollTo(0, 0);
}
function returnToMenu() {
  resetPresentation();
  fx.music('menu');
  board.querySelector('.board-video')?.pause();
  game = null;
  mode = null;
  byId('match-clock').hidden = true;
  cover.hidden = false;
  syncCoverVideo();
  byId('partida').hidden = true;
  document.body.classList.remove('playing', 'revealing');
  layoutScene();
  gameMenuButton.hidden = true;
  showPlayOptions(false);
  window.scrollTo(0, 0);
}
function confirmRestart(title, label, callback) {
  if (game?.events.length > 1 && game.phase !== 'end') {
    confirmAction(title, 'Se cerrará la partida actual.', label, callback);
  } else callback();
}
function showPlayOptions(open) {
  playMenu.setAttribute('aria-expanded', String(open));
  playMenu.hidden = open;
  playOptions.hidden = !open;
  (open ? byId('help-button') : playMenu).focus({ preventScroll: true });
}
const characterForm = byId('character-form');
const characterConfirm = byId('character-confirm');
const characterPreview = byId('character-preview');
const characterName = byId('character-name');
let matchSetup = null;
function showCharacterPreview() {
  const animal = characterForm.elements.character.value;
  characterPreview.src = characterArt(characterDialog.dataset.side, animal);
  characterName.textContent = animals[animal];
}
function showCharacterOptions(side) {
  characterDialog.dataset.side = side;
  byId('character-side').textContent = rules.SIDE[side];
  characterForm.elements.character.value = matchSetup.characters[side] ?? 'mono';
  for (const option of characterForm.querySelectorAll('.character-option')) {
    option.querySelector('img').src = characterArt(side, option.querySelector('input').value);
  }
  characterConfirm.textContent = side === 'I' && matchSetup.mode === 'local' ? 'Siguiente' : 'Empezar';
  showCharacterPreview();
  if (!characterDialog.open) characterDialog.showModal();
  characterForm.querySelector('input:checked').focus({ preventScroll: true });
}
function chooseCharacters(nextMode) {
  matchSetup = { mode: nextMode, characters: { I: null, R: 'tigrillo' } };
  showCharacterOptions('I');
}
characterForm.addEventListener('change', showCharacterPreview);
characterForm.addEventListener('submit', event => {
  event.preventDefault();
  const { mode: nextMode, characters } = matchSetup;
  const side = characterDialog.dataset.side;
  characters[side] = characterForm.elements.character.value;
  if (side === 'I' && nextMode === 'local') {
    showCharacterOptions('R');
    return;
  }
  matchSetup = null;
  characterDialog.close();
  startGame(nextMode, characters);
});
function goBackFromCharacterSelection() {
  if (characterDialog.dataset.side === 'R') showCharacterOptions('I');
  else characterDialog.close();
}
byId('character-cancel').addEventListener('click', goBackFromCharacterSelection);
characterDialog.addEventListener('cancel', event => {
  event.preventDefault();
  goBackFromCharacterSelection();
});
characterDialog.addEventListener('close', () => {
  if (!matchSetup || characterDialog.open) return;
  matchSetup = null;
  if (game && !busy() && game.phase !== 'end') gameMenuButton.focus({ preventScroll: true });
});
byId('play-local').addEventListener('click', () => chooseCharacters('local'));
byId('play-ai').addEventListener('click', () => chooseCharacters('ai'));
byId('match-menu').addEventListener('click', () => {
  gameMenu.close();
  confirmRestart('¿Volver al menú?', 'Volver al menú', returnToMenu);
});
byId('restart').addEventListener('click', () => {
  gameMenu.close();
  confirmRestart('¿Empezar otra partida?', 'Nueva partida', () => chooseCharacters(mode));
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


// La primera pulsación de ¡Jugar! habilita la música y precarga la partida.
const STARTUP_MIN_MS = 5000;
const STARTUP_MAX_MS = 8000;
const startupImages = [
  ...['opciones', 'moneda', 'mover', 'atacar', 'fuego', 'fin-turno', 'marco', 'casilla-azul', 'casilla-verde', 'casilla-roja', 'ranura-carta'].map(hudArt),
  searchArt,
  'assets/logo.webp', 'assets/clay/portada-vertical.webp',
  'assets/clay/terracota.webp', 'assets/clay/campo-jardin.webp',
  'assets/clay/flor.webp', 'assets/clay/relieve.webp', 'assets/clay/jardin-izquierdo.webp',
  'assets/clay/jardin-derecho.webp', 'assets/clay/cordon.webp',
  'assets/clay/dorso-idealista.webp', 'assets/clay/dorso-realista.webp',
  'assets/v014/cartas-aprobadas.webp', ...Object.values(cannonArt),
  'assets/escenario/campo-andino-poster.webp', 'assets/escenario/campo-andino-fondo.webp',
  ...['rescate', 'idealista', 'realista', 'turno', 'boost', 'decisive', 'cannon', 'weaken', 'major']
    .map(name => 'assets/clay/emblemas/' + name + '.webp'),
  ...Object.entries(rules.ROSTER).flatMap(([side, roster]) => roster.map(animal =>
    characterArt(side, animal))),
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
  syncCoverVideo();
  if (startupStarted) {
    showPlayOptions(true);
    return;
  }
  startupStarted = true;
  // Debe ocurrir en el gesto de usuario, antes de cualquier await o temporizador.
  fx.music('menu');
  const start = performance.now();
  const intro = byId('startup');
  const progress = byId('startup-progress');
  const percent = byId('startup-percent');
  const status = byId('startup-status');
  playMenu.hidden = true;
  intro.hidden = false;
  intro.focus({ preventScroll: true });
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
      showPlayOptions(true);
    });
  };
  requestAnimationFrame(tick);
}
playMenu.addEventListener('click', beginStartup);
playMenu.disabled = false;
syncCoverVideo();


// Contenedores completos sin desplazamiento: adapta el contenido real a la altura visible.
function fitPanel(panel) {
  if (!panel || !panel.getClientRects().length || panel.hidden || (panel.tagName === 'DIALOG' && !panel.open)) return;
  let inner = panel.querySelector(':scope > .fit-content');
  if (!inner) {
    inner = document.createElement('div');
    inner.className = 'fit-content';
    inner.append(...panel.childNodes);
    panel.append(inner);
  }
  inner.style.zoom = '1';
  const viewport = window.visualViewport?.height ?? window.innerHeight;
  const style = getComputedStyle(panel);
  const inset = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  const limit = Math.max(50, viewport - inset - 32);
  let scale = 1;
  for (let pass = 0; pass < 4; pass++) {
    const height = Math.max(inner.getBoundingClientRect().height, inner.scrollHeight * scale);
    if (height <= limit + 1) break;
    scale *= limit / height;
    inner.style.zoom = String(scale);
  }
}
function fitOpenPanels() {
  for (const panel of document.querySelectorAll('dialog[open], #stats-screen:not([hidden]) .stats-card, #end-screen:not([hidden]) .end-card')) fitPanel(panel);
}
const fitObserver = new MutationObserver(fitOpenPanels);
for (const panel of document.querySelectorAll('dialog, #stats-screen, #end-screen')) {
  fitObserver.observe(panel, { attributes: true, attributeFilter: ['open','hidden'] });
}
window.addEventListener('resize',fitOpenPanels);
window.visualViewport?.addEventListener('resize',fitOpenPanels);
