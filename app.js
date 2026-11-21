'use strict';

const rules = window.RealesIdeales;
const byId = id => document.getElementById(id);
const board = byId('board');
const actions = byId('actions');
const dialog = byId('decision');
const hexButtons = new Map();
const symbols = { boost: '+1', weaken: '−1', major: '+2', decisive: '✦', cannon: '◆' };
let game = rules.makeGame();
let selection = null;
let privateHand = false;
let pending = null;
let drag = null;
let suppressClick = false;
let shown = { I: [], R: [] };
let restoreCards = null;
let battleResult = null;
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
    const symbol = document.createElement('p');
    symbol.textContent = symbols[card];
    preview.append(symbol, document.createTextNode(rules.CARDS[card].description));
  }
  pending = callback;
  dialog.showModal();
}
byId('cancel').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { if (!dialog.open) pending = null; });
byId('confirm').addEventListener('click', () => {
  const callback = pending;
  pending = null;
  dialog.close();
  callback?.();
});

function makeToken(piece) {
  const node = document.createElement('span');
  node.className = 'token ' + piece.side + (piece.cannon ? ' cannon' : '');
  node.dataset.piece = piece.id;
  node.setAttribute('aria-hidden', 'true');
  if (piece.cannon) span(node, 'cannon-shape', '');
  else node.textContent = piece.id;
  return node;
}
for (const cell of Object.values(rules.CELLS)) {
  const hex = button(board, '', () => { if (!suppressClick) clickCell(cell.id); }, 'hex');
  hex.dataset.zone = cell.zone;
  hex.dataset.cell = cell.id;
  hex.style.left = (12.5 + cell.col * 18.75) + '%';
  hex.style.top = (cell.row / 12 * 100) + '%';
  hexButtons.set(cell.id, hex);
}
function selectable(id) {
  return rules.moves(game, id).length > 0 || rules.attacks(game, id).length > 0;
}
function proposeDestination(id, cell) {
  if (rules.moves(game, id).includes(cell)) {
    confirmAction('¿Mover la ficha?', 'Mover ' + id + ' a la casilla ' + cell + '.', 'Mover', () => {
      started ??= Date.now();
      rules.move(game, id, cell);
      selection = null;
      render();
    });
    return true;
  }
  const target = rules.occupant(game, cell);
  if (target && rules.attacks(game, id).includes(target.id)) {
    confirmAction('¿Atacar a esta ficha?', id + ' atacará a ' + target.id + ' en ' + cell + '.', 'Atacar', () => {
      started ??= Date.now();
      clearRevealed();
      battleResult = null;
      rules.attack(game, id, target.id);
      selection = null;
      privateHand = false;
      render();
    });
    return true;
  }
  return false;
}
function clickCell(cell) {
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
    const star = rules.STARS.I.includes(cell) || rules.STARS.R.includes(cell);
    let target = moves.includes(cell) ? 'move' : targets.includes(piece?.id) ? 'target' : '';
    if (game.phase === 'rescue' && selection && !piece && rules.ZONES[game.rescue.side].includes(cell)) target = 'move';
    if (game.phase === 'summon' && piece?.side === game.summons[0]) target = 'move';
    hex.dataset.highlight = target;
    hex.setAttribute('aria-pressed', String(Boolean(piece && piece.id === selection)));
    hex.setAttribute('aria-label', [cell, star ? 'estrella de rescate' : '', piece
      ? rules.SIDE[piece.side] + ' ' + piece.id + (piece.cannon ? ', cañón' : '') : 'libre',
      target === 'target' ? 'objetivo de ataque' : target === 'move' ? 'movimiento disponible' : ''].filter(Boolean).join(', '));
    hex.replaceChildren();
    if (star) span(hex, 'star', '★');
    if (piece) {
      const token = makeToken(piece);
      if (drag?.ghost && drag.id === piece.id) token.classList.add('origin');
      hex.append(token);
    }
    span(hex, 'coordinate', cell);
  }
}
board.addEventListener('pointerdown', event => {
  suppressClick = false;
  if (dialog.open || !event.isPrimary || event.button !== 0) return;
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
      const visible = Boolean(face || (card && privateHand && actor === side));
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'card ' + (visible ? 'front' : card ? 'back' : 'empty');
      node.disabled = !visible || !revealing || !privateHand || actor !== side || Boolean(face)
        || !rules.playable(game, side, card);
      if (face) node.classList.add('played', ...(face.latest ? ['new'] : []));
      if (visible && !face && !node.disabled) node.classList.add('ready');
      if (visible) {
        span(node, 'symbol', symbols[card]);
        const name = document.createElement('strong');
        name.textContent = rules.CARDS[card].name;
        node.append(name);
        node.setAttribute('aria-label', face ? 'Revelada: ' + name.textContent : name.textContent);
        if (!node.disabled) node.addEventListener('click', () =>
          confirmAction(rules.CARDS[card].name, '¿Deseas activar esta carta?', 'Activar', () => play(handIndex, slot), card));
      } else {
        node.textContent = card ? '✦' : '—';
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
  started ??= Date.now();
  rules.nextTurn(game);
  render();
}
function renderControls() {
  actions.replaceChildren();
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
        button(actions, 'Rescatar ' + piece.id, () => { selection = piece.id; render(); }, 'primary'));
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
function render() {
  if (game.phase === 'end' && ended === null) ended = Date.now();
  byId('round').textContent = 'Ronda ' + game.round + ' de 12';
  byId('active-side').textContent = game.phase === 'end' ? 'Partida terminada' : 'Turno ' + (game.turn === 'I' ? 'idealista' : 'realista');
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
  byId('log').replaceChildren(...game.events.slice(-8).reverse().map(event => {
    const item = document.createElement('li');
    item.textContent = event.text;
    return item;
  }));
}
byId('restart').addEventListener('click', () => {
  const restart = () => {
    game = rules.makeGame();
    selection = null;
    privateHand = false;
    clearRevealed();
    battleResult = null;
    started = null;
    ended = null;
    render();
  };
  if (game.events.length > 1 && game.phase !== 'end') {
    confirmAction('¿Empezar otra partida?', 'Se borrará el tablero actual. Puedes exportar la partida desde el registro.', 'Nueva partida', restart);
  } else restart();
});
byId('export').addEventListener('click', () => {
  const data = { version: '0.6', complete: game.phase === 'end', round: game.round,
    durationSeconds: started === null ? 0 : Math.floor(((ended ?? Date.now()) - started) / 1000),
    winner: game.winner, reason: game.reason, events: game.events };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'reales-ideales-partida.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});
render();
