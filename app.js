'use strict';

const rules = window.RealesIdeales;
const ai = window.RealesIdealesAI;
const byId = id => document.getElementById(id);
const board = byId('board');
const actions = byId('actions');
const dialog = byId('decision');
const hexButtons = new Map();
const roster = {
  R: [
    ['Anaconda', 'anaconda'], ['Puma', 'puma'], ['Cóndor', 'condor'],
    ['Gallo de las rocas', 'gallo-de-las-rocas'], ['Cuy', 'cuy'], ['Vicuña', 'vicuna'],
    ['Puma', 'puma'], ['Vicuña', 'vicuna'],
  ],
  I: [
    ['Mono', 'mono'], ['Llama', 'llama'], ['Guacamayo', 'guacamayo'],
    ['Tortuga gigante', 'tortuga-gigante'], ['Tigrillo', 'tigrillo'], ['Gallo', 'gallo'],
    ['Llama', 'llama'], ['Gallo', 'gallo'],
  ],
};
const symbols = { boost: '+1', weaken: '−1', major: '+2', decisive: '✦', cannon: '◆' };
const cardLooks = {
  boost: ['Táctica', 'llama'],
  weaken: ['Control', 'anaconda'],
  major: ['Táctica', 'tigrillo'],
  decisive: ['Ataque', 'condor'],
  cannon: ['Invocación', null],
};
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
  byId('confirm').textContent = label;
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

function artwork(name) {
  return 'assets/' + name + '.webp';
}
function renderCardFace(parent, card, preview = false) {
  const [type, portrait] = cardLooks[card];
  parent.dataset.card = card;
  const title = span(parent, 'card-title', rules.CARDS[card].name);
  const art = span(parent, 'card-art', '');
  art.setAttribute('aria-hidden', 'true');
  if (portrait) {
    const image = document.createElement('img');
    image.src = artwork(portrait);
    image.alt = '';
    image.draggable = false;
    art.append(image);
  } else span(art, 'cannon-shape', '');
  span(art, 'card-emblem', symbols[card]);
  span(parent, 'card-type', type);
  if (preview) span(parent, 'card-effect', rules.CARDS[card].description);
  return title.textContent;
}
function character(piece) {
  return roster[piece.side][Number(piece.id.slice(1)) - 1];
}
function pieceName(piece) {
  return piece.cannon ? 'Cañón ' + piece.id : character(piece)[0] + ' ' + piece.id;
}
function makeToken(piece) {
  const node = document.createElement('span');
  node.className = 'token ' + piece.side + (piece.cannon ? ' cannon' : '');
  node.dataset.piece = piece.id;
  node.setAttribute('aria-hidden', 'true');
  if (piece.cannon) span(node, 'cannon-shape', '');
  else {
    const animal = character(piece)[1];
    node.dataset.character = animal;
    const portrait = document.createElement('span');
    portrait.className = 'token-portrait';
    const image = document.createElement('img');
    image.src = artwork(animal);
    image.alt = '';
    image.draggable = false;
    portrait.append(image);
    node.append(portrait);
  }
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
  return rules.moves(game, id).length > 0 || rules.attacks(game, id).length > 0;
}
function proposeDestination(id, cell) {
  const actor = rules.piece(game, id);
  if (rules.moves(game, id).includes(cell)) {
    confirmAction('¿Mover la ficha?', 'Mover a ' + pieceName(actor) + ' a la casilla ' + cell + '.', 'Mover', () => {
      started ??= Date.now();
      rules.move(game, id, cell);
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
  selection = null;
  privateHand = false;
  render();
}
function clickCell(cell) {
  if (!game || isAITurn()) return;
  const piece = rules.occupant(game, cell);
  if (game.phase === 'summon' && piece) {
    rules.summon(game, piece.id);
  } else if (game.phase === 'rescue' && selection && !piece) {
    if (rules.rescue(game, selection, cell)) selection = null;
  } else if (game.phase === 'turn' || game.phase === 'bonus') {
    privateHand = false;
    if (selection && proposeDestination(selection, cell)) return;
    if (piece && selectable(piece.id)) selection = selection === piece.id ? null : piece.id;
    else selection = null;
  }
  render();
}
function renderBoard() {
  const moves = selection ? rules.moves(game, selection) : [];
  const targets = selection ? rules.attacks(game, selection) : [];
  for (const [cell, hex] of hexButtons) {
    const piece = rules.occupant(game, cell);
    const star = rescueCells.has(cell);
    let target = moves.includes(cell) ? 'move' : targets.includes(piece?.id) ? 'target' : '';
    if (game.phase === 'rescue' && selection && !piece && rules.ZONES[game.rescue.side].includes(cell)) target = 'move';
    if (game.phase === 'summon' && piece?.side === game.summons[0]) target = 'move';
    hex.dataset.highlight = target;
    hex.setAttribute('aria-pressed', String(Boolean(piece && piece.id === selection)));
    hex.setAttribute('aria-label', [cell, star ? 'estrella de rescate' : '', piece
      ? rules.SIDE[piece.side] + ' · ' + pieceName(piece) : 'libre',
      target === 'target' ? 'objetivo de ataque' : target === 'move' ? 'movimiento disponible' : ''].filter(Boolean).join(', '));
    hex.replaceChildren();
    if (piece) {
      const token = makeToken(piece);
      if (drag?.ghost && drag.id === piece.id) token.classList.add('origin');
      hex.append(token);
    }
  }
}
board.addEventListener('pointerdown', event => {
  suppressClick = false;
  if (!game || isAITurn() || dialog.open || !event.isPrimary || event.button !== 0) return;
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
function play(index = null, slot = null) {
  const side = rules.actor(game);
  const card = index === null ? null : game.players[side].hand[index];
  if (card && slot === null) {
    slot = [0, 1].filter(position => !shown[side].some(face => face.slot === position))[index];
  }
  if (!rules.reveal(game, index)) return;
  if (card) shown[side].push({ slot, card, latest: true });
  privateHand = false;
  if (game.phase !== 'reveal') {
    battleResult = game.events.findLast(event => event.type === 'battle');
    restoreCards = setTimeout(() => {
      clearRevealed();
      renderHands();
    }, 1550);
  }
  render();
  if (card) shown[side].at(-1).latest = false;
}
function renderHands() {
  const revealing = game.phase === 'reveal';
  const actor = revealing ? rules.actor(game) : game.turn;
  for (const side of ['I', 'R']) {
    const hand = byId('hand-' + side);
    hand.closest('.seat').dataset.prompt = String(actor === side && ['turn', 'reveal'].includes(game.phase));
    hand.replaceChildren();
    let index = 0;
    for (let slot = 0; slot < 2; slot++) {
      const face = shown[side].find(item => item.slot === slot);
      const handIndex = face ? null : index++;
      const card = face?.card ?? game.players[side].hand[handIndex];
      const visible = Boolean(face || (card && privateHand && actor === side && !isAITurn()));
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'card ' + (visible ? 'front' : card ? 'back' : 'empty');
      node.disabled = !visible || !revealing || !privateHand || actor !== side || Boolean(face)
        || !rules.playable(game, side, card);
      if (face) node.classList.add('played', ...(face.latest ? ['new'] : []));
      if (visible && !face && !node.disabled) node.classList.add('ready');
      if (visible) {
        const name = renderCardFace(node, card);
        node.setAttribute('aria-label', face ? 'Revelada: ' + name : name);
        if (!node.disabled) node.addEventListener('click', () =>
          confirmAction(rules.CARDS[card].name, '¿Deseas activar esta carta?', 'Activar', () => play(handIndex, slot), card));
      } else {
        if (card) span(node, 'card-sigil', '✦');
        else node.textContent = '—';
        node.setAttribute('aria-label', card ? 'Carta boca abajo ' + (slot + 1) : 'Sin carta');
      }
      hand.append(node);
    }
  }
}
function nextTurn() {
  selection = null;
  privateHand = false;
  clearRevealed();
  battleResult = null;
  duel = null;
  started ??= Date.now();
  rules.nextTurn(game);
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
      say('Turno de ' + rules.SIDE[game.turn], game.actions === 2 ? 'Completaste tus dos acciones.'
        : selection ? 'Suelta la ficha en una casilla marcada o toca su destino.' : 'Arrastra o toca una ficha propia.');
      button(actions, 'Terminar turno', nextTurn, 'primary');
      button(actions, privateHand ? 'Ocultar mis cartas' : 'Ver mis cartas', () => {
        clearRevealed();
        privateHand = !privateHand;
        render();
      }, 'secondary');
      break;
    case 'reveal': {
      const side = rules.actor(game);
      const role = side === game.battle.defender ? 'Defensa' : 'Ataque';
      say(role + ' · ' + rules.SIDE[side], privateHand
        ? 'Elige una carta de tu lado para verla y decidir si la activas. También puedes pasar.'
        : mode === 'ai' ? 'Puedes mirar tus cartas o pasar.'
          : '¿Deseas activar una carta? Entrega el dispositivo a ' + rules.SIDE[side].toLowerCase() + '.');
      if (!privateHand) button(actions, 'Ver mis cartas', () => {
        privateHand = true;
        render();
      }, 'primary');
      button(actions, 'Pasar sin activar', () => play(), 'secondary');
      break;
    }
    case 'bonus':
      say('Avance de ' + rules.SIDE[game.battle.winner], 'Mueve una ficha propia a una casilla libre vecina.');
      button(actions, 'Omitir avance', () => { selection = null; rules.skipBonus(game); render(); }, 'secondary');
      break;
    case 'rescue':
      say('Rescate de ' + rules.SIDE[game.rescue.side], selection
        ? 'Coloca a ' + selection + ' en una de tus casillas de despliegue libres.'
        : 'Elige la ficha que volverá al tablero como ficha normal.');
      game.pieces.filter(piece => !piece.cell && piece.side === game.rescue.side).forEach(piece =>
        button(actions, 'Rescatar a ' + character(piece)[0] + ' ' + piece.id, () => { selection = piece.id; render(); }, 'primary'));
      button(actions, 'Guardar marcador', () => { rules.rescue(game, null); selection = null; render(); }, 'secondary');
      break;
    case 'summon':
      say('Cañón de ' + rules.SIDE[game.summons[0]], 'Toca la ficha propia que quieres convertir en cañón. Podrá atacar en tu próximo turno.');
      break;
    case 'end':
      say(game.winner ? 'Ganan los ' + rules.SIDE[game.winner].toLowerCase() : 'Empate',
        game.reason === 'eliminación' ? 'Partida decidida por las últimas fichas.' : 'Se completaron las 12 rondas.');
      break;
  }
}
function renderDuel() {
  const view = byId('duel');
  view.hidden = !duel;
  view.replaceChildren();
  if (!duel) return;
  const [attacker, defender] = duel;
  for (const [index, piece] of duel.entries()) {
    if (index === 1) span(view, 'duel-versus', 'VS');
    const portrait = document.createElement('div');
    portrait.className = 'duelist';
    portrait.dataset.side = piece.side;
    portrait.append(makeToken(piece));
    span(portrait, 'duelist-name', piece.cannon ? 'Cañón' : character(piece)[0]);
    span(portrait, 'duelist-role', index === 0 ? 'Ataca' : 'Defiende');
    if (battleResult?.removed.includes(piece.id)) portrait.dataset.defeated = 'true';
    view.append(portrait);
  }
  view.setAttribute('aria-label', pieceName(attacker) + ' contra ' + pieceName(defender));
}
function render() {
  if (game.phase === 'end' && ended === null) ended = Date.now();
  byId('round').textContent = 'Ronda ' + game.round + ' de 12';
  byId('active-side').textContent = game.phase === 'end' ? 'Partida terminada' : game.turn === 'I' ? 'Turno idealista' : mode === 'ai' ? 'Turno de la IA' : 'Turno realista';
  byId('blue').textContent = rules.remaining(game, 'I');
  byId('red').textContent = rules.remaining(game, 'R');
  byId('blue-rescues').textContent = 'Rescates: ' + game.players.I.rescues;
  byId('red-rescues').textContent = 'Rescates: ' + game.players.R.rescues;
  byId('turn-info').textContent = game.phase === 'reveal' ? 'Carta o pase ' + (game.battle.slot + 1) + ' de 4'
    : game.phase === 'turn' ? 'Acciones: ' + game.actions + ' de 2' : '';
  const result = byId('battle-result');
  result.hidden = !battleResult;
  if (battleResult) {
    result.dataset.winner = battleResult.winner ?? '';
    result.textContent = (battleResult.advantage ? 'Golpe decisivo · ' : battleResult.force.join(' a ') + ' · ') + battleResult.text;
  }
  renderBoard();
  renderHands();
  renderControls();
  renderDuel();
  byId('log').replaceChildren(...game.events.slice(-8).reverse().map(event => {
    const item = document.createElement('li');
    item.textContent = event.text;
    return item;
  }));
  scheduleAI();
}
function scheduleAI() {
  clearTimeout(aiTimer);
  aiTimer = null;
  if (!game || dialog.open || !isAITurn()) return;
  aiTimer = setTimeout(() => {
    aiTimer = null;
    if (!game || dialog.open || !isAITurn()) return;
    const action = ai.choose(rules, game, 'R');
    if (!action) return;
    switch (action.type) {
      case 'attack':
        startAttack(rules.piece(game, action.piece), rules.piece(game, action.target));
        return;
      case 'reveal': play(action.index); return;
      case 'nextTurn': nextTurn(); return;
      case 'move': rules.move(game, action.piece, action.cell); break;
      case 'rescue': rules.rescue(game, action.piece, action.cell); break;
      case 'summon': rules.summon(game, action.piece); break;
      case 'skipBonus': rules.skipBonus(game); break;
    }
    render();
  }, game.phase === 'reveal' ? 650 : 440);
}
function resetPresentation() {
  clearTimeout(aiTimer);
  drag?.ghost?.remove();
  drag = null;
  selection = null;
  privateHand = false;
  clearRevealed();
  battleResult = null;
  duel = null;
  started = null;
  ended = null;
}
function startGame(nextMode) {
  resetPresentation();
  mode = nextMode;
  game = rules.makeGame();
  byId('inicio').hidden = true;
  byId('partida').hidden = false;
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
  const data = { version: '0.9', mode, complete: game.phase === 'end', round: game.round,
    durationSeconds: started === null ? 0 : Math.floor(((ended ?? Date.now()) - started) / 1000),
    winner: game.winner, reason: game.reason, events: game.events };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'reales-ideales-partida.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});
