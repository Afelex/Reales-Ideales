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
  boost: 'Táctica',
  weaken: 'Control',
  major: 'Táctica',
  decisive: 'Ataque',
  cannon: 'Invocación',
};
let game = null;
let mode = null;
let aiTimer = null;
let selection = null;
let choosingCannon = false;
let pending = null;
let drag = null;
let suppressClick = false;
let shown = { I: [], R: [] };
let restoreCards = null;
let battleResult = null;
let duel = null;
let started = null;
let ended = null;
let matchClock = null;

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
function confirmAction(title, text, label, callback) {
  if (dialog.open) return;
  byId('decision-title').textContent = title;
  byId('decision-text').textContent = text;
  byId('confirm').textContent = label;
  byId('confirm').hidden = false;
  byId('confirm').disabled = false;
  byId('cancel').textContent = 'Cancelar';
  byId('decision-card').hidden = true;
  byId('decision-options').hidden = true;
  pending = callback;
  dialog.showModal();
}
byId('cancel').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  if (!dialog.open) {
    pending = null;
    const preview = byId('decision-card');
    preview.hidden = true;
    preview.replaceChildren();
    const options = byId('decision-options');
    options.hidden = true;
    options.replaceChildren();
    byId('confirm').disabled = false;
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
  parent.dataset.card = card;
  const title = span(parent, 'card-title', rules.CARDS[card].name);
  const art = span(parent, 'card-art', '');
  art.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img');
  image.src = 'assets/clay/' + card + '.webp';
  image.alt = '';
  image.draggable = false;
  art.append(image);
  span(art, 'card-emblem', symbols[card]);
  span(parent, 'card-type', cardLooks[card]);
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
    const image = document.createElement('img');
    image.src = artwork(character(piece)[1]);
    image.alt = '';
    image.draggable = false;
    node.append(image);
  }
  return node;
}
const rescueCells = new Set([...rules.STARS.I, ...rules.STARS.R]);
for (const cell of Object.values(rules.CELLS)) {
  const hex = button(board, '', () => { if (!suppressClick) clickCell(cell.id); }, 'hex');
  hex.dataset.cell = cell.id;
  hex.dataset.zone = cell.zone;
  // Flat-topped hexagons share edges on a 620 × 680 coordinate system.
  hex.style.left = ((110 + cell.col * 100) / 620 * 100) + '%';
  hex.style.top = ((90 + (cell.row - 1) * 50) / 680 * 100) + '%';
  span(hex, 'hex-code', cell.id).setAttribute('aria-hidden', 'true');
  if (rescueCells.has(cell.id)) span(hex, 'rescue-star', '').setAttribute('aria-hidden', 'true');
  hexButtons.set(cell.id, { hex, token: null });
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
    const risk = actor.cannon ? ' El rival puede responder con cartas. Si el cañón pierde o empata, se retira.' : '';
    confirmAction('¿Atacar a esta ficha?', pieceName(actor) + ' atacará a ' + pieceName(target) + ' en ' + cell + '.' + risk, 'Atacar', () => {
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
  render();
}
function clickCell(cell) {
  if (!game || isAITurn()) return;
  const piece = rules.occupant(game, cell);
  if (choosingCannon) {
    if (piece?.side !== game.turn) return;
    confirmAction('¿Invocar cañón en ' + cell + '?', 'Transformarás a ' + pieceName(piece) +
      ' y gastarás 1 acción. Podrá disparar desde tu próximo turno.', 'Invocar', () => {
      if (!rules.summonInTurn(game, game.turn, piece.id)) return;
      choosingCannon = false;
      clearRevealed();
      render();
    });
    return;
  }
  if (game.phase === 'summon' && piece) {
    rules.summon(game, piece.id);
  } else if (game.phase === 'rescue' && selection && !piece) {
    if (rules.rescue(game, selection, cell)) selection = null;
  } else if (game.phase === 'turn' || game.phase === 'bonus') {
    if (selection && proposeDestination(selection, cell)) return;
    if (piece && selectable(piece.id)) selection = selection === piece.id ? null : piece.id;
    else selection = null;
  }
  render();
}
function renderBoard() {
  const moves = selection ? rules.moves(game, selection) : [];
  const targets = selection ? rules.attacks(game, selection) : [];
  for (const [cell, view] of hexButtons) {
    const { hex } = view;
    const piece = rules.occupant(game, cell);
    const star = rescueCells.has(cell);
    const moved = Boolean(piece && game.phase === 'turn' && game.moved.includes(piece.id));
    let target = moves.includes(cell) ? 'move' : targets.includes(piece?.id) ? 'target' : '';
    if (game.phase === 'rescue' && selection && !piece && rules.ZONES[game.rescue.side].includes(cell)) target = 'move';
    if (game.phase === 'summon' && piece?.side === game.summons[0]) target = 'move';
    if (choosingCannon && piece?.side === game.turn) target = 'summon';
    hex.dataset.highlight = target;
    hex.setAttribute('aria-pressed', String(Boolean(piece && piece.id === selection)));
    hex.setAttribute('aria-label', [cell, star ? 'estrella de rescate' : '', piece
      ? rules.SIDE[piece.side] + ' · ' + pieceName(piece) : 'libre',
      moved ? 'ya se movió en este turno' : '',
      { target: 'objetivo de ataque', move: 'movimiento disponible', summon: 'disponible para invocar cañón' }[target]].filter(Boolean).join(', '));
    view.token?.remove();
    view.token = null;
    if (piece) {
      const token = makeToken(piece);
      if (moved) span(token, 'moved-check', '✓');
      if (drag?.ghost && drag.id === piece.id) token.classList.add('origin');
      hex.append(token);
      view.token = token;
    }
  }
}
board.addEventListener('pointerdown', event => {
  suppressClick = false;
  if (!game || isAITurn() || choosingCannon || dialog.open || !event.isPrimary || event.button !== 0) return;
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
function peekCard(side, index, slot) {
  if (dialog.open || side !== ai.decisionSide(game, rules) || isAITurn()) return;
  const card = game.players[side].hand[index];
  if (!card || !['turn', 'reveal'].includes(game.phase)) return;
  const canPlay = game.phase === 'reveal' && rules.playable(game, side, card);
  const canSummon = card === 'cannon' && rules.canSummonInTurn(game, side);
  byId('decision-title').textContent = 'Carta privada · ' + rules.SIDE[side];
  byId('decision-text').textContent = canPlay ? 'Actívala para mostrarla en la mesa.' :
    canSummon ? 'Elige en el tablero la ficha que quieres transformar.' : '';
  byId('cancel').textContent = 'Ocultar';
  byId('confirm').textContent = canSummon ? 'Elegir ficha' : 'Activar';
  byId('confirm').hidden = !canPlay && !canSummon;
  byId('confirm').disabled = false;
  const preview = byId('decision-card');
  preview.replaceChildren();
  preview.hidden = false;
  renderCardFace(preview, card, true);
  pending = canPlay ? () => play(index, slot) : canSummon ? () => {
    choosingCannon = true;
    selection = null;
    render();
    board.querySelector('[data-highlight="summon"]')?.focus();
  } : null;
  dialog.showModal();
}
function renderHands() {
  const actor = ai.decisionSide(game, rules);
  const cardsAvailable = !choosingCannon && ['turn', 'reveal'].includes(game.phase);
  for (const side of ['I', 'R']) {
    const hand = byId('hand-' + side);
    const ownsDecision = actor === side;
    hand.replaceChildren();
    let index = 0;
    for (let slot = 0; slot < 2; slot++) {
      const face = shown[side].find(item => item.slot === slot);
      const handIndex = face ? null : index++;
      const card = face?.card ?? game.players[side].hand[handIndex];
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'card ' + (face ? 'front played' : card ? 'back' : 'empty');
      node.disabled = !card || Boolean(face) || !cardsAvailable || !ownsDecision || isAITurn();
      if (face) {
        if (face.latest) node.classList.add('new');
        node.setAttribute('aria-label', 'Revelada: ' + renderCardFace(node, card));
      } else if (card) {
        node.setAttribute('aria-label', 'Carta ' + (slot + 1) + ' de ' + rules.SIDE[side] + ', boca abajo');
        if (!node.disabled) node.addEventListener('click', () => peekCard(side, handIndex, slot));
      } else {
        node.textContent = '—';
        node.setAttribute('aria-label', 'Sin carta');
      }
      hand.append(node);
    }
  }
}
function openPreparation() {
  const side = game.turn;
  const hand = game.players[side].hand;
  const controls = byId('decision-options');
  const source = document.createElement('select');
  const destination = document.createElement('select');
  for (const [label, select] of [['Devolver a tu mazo', source], ['Tomar de tu mazo', destination]]) {
    const field = document.createElement('label');
    field.textContent = label;
    select.className = 'secondary';
    field.append(select);
    controls.append(field);
  }
  for (const [index, card] of hand.entries()) {
    if (rules.preparationChoices(game, side, index).length) source.add(new Option(rules.CARDS[card].name, index));
  }
  function updateChoices() {
    destination.replaceChildren(new Option('Elige una carta', ''));
    for (const card of rules.preparationChoices(game, side, Number(source.value))) {
      destination.add(new Option(rules.CARDS[card].name, card));
    }
    byId('confirm').disabled = true;
  }
  confirmAction('Preparar carta · ' + rules.SIDE[side],
    'El cambio es privado. Cuesta 1 acción y puedes hacerlo una vez por partida.', 'Confirmar cambio', () => {
      if (!rules.prepare(game, side, Number(source.value), destination.value)) return;
      selection = null;
      clearRevealed();
      render();
    });
  controls.hidden = false;
  source.addEventListener('change', updateChoices);
  destination.addEventListener('change', () => { byId('confirm').disabled = !destination.value; });
  updateChoices();
  source.focus();
}
function nextTurn() {
  selection = null;
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
      if (choosingCannon) {
        say('Invocar cañón', 'Toca una ficha resaltada para transformarla.');
        button(actions, 'Cancelar invocación', () => { choosingCannon = false; render(); }, 'secondary');
        break;
      }
      say('Jugadas del turno', game.actions === 2 ? ''
        : selection ? 'Toca o arrastra hacia un destino marcado.' : 'Toca o arrastra una ficha propia.');
      const side = game.turn;
      if (game.players[side].hand.some((_, index) => rules.preparationChoices(game, side, index).length)) {
        button(actions, 'Preparar carta', openPreparation, 'secondary');
      }
      button(actions, 'Terminar turno', nextTurn, 'primary end-turn');
      break;
    case 'reveal': {
      const side = rules.actor(game);
      const role = side === game.battle.defender ? 'Defensa' : 'Ataque';
      say(role + ' · ' + rules.SIDE[side], 'Toca una carta propia para verla o pasa.');
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
      const picker = document.createElement('select');
      picker.className = 'secondary';
      picker.setAttribute('aria-label', 'Ficha para rescatar');
      picker.add(new Option('Elige una ficha', ''));
      for (const piece of game.pieces.filter(piece => !piece.cell && piece.side === game.rescue.side)) {
        picker.add(new Option(character(piece)[0] + ' ' + piece.id, piece.id));
      }
      picker.value = selection ?? '';
      picker.addEventListener('change', () => {
        selection = picker.value || null;
        byId('instructions').textContent = selection ? 'Toca una casilla libre de tu zona.' : 'Elige la ficha que volverá al tablero.';
        renderBoard();
      });
      actions.append(picker);
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
function updateClock() {
  const elapsed = started === null ? 0 : Math.max(0, Math.floor(((ended ?? Date.now()) - started) / 1000));
  const timer = byId('match-timer');
  timer.textContent = Math.floor(elapsed / 60) + ':' + String(elapsed % 60).padStart(2, '0');
  timer.dateTime = 'PT' + elapsed + 'S';
}
function renderTurnInfo() {
  const turnInfo = byId('turn-info');
  const attackInfo = byId('attack-info');
  attackInfo.hidden = game.phase !== 'turn';
  if (game.phase !== 'turn') {
    turnInfo.textContent = game.phase === 'reveal' ? 'Carta o pase ' + (game.battle.slot + 1) + ' de 4' : '';
    return;
  }
  turnInfo.textContent = 'Acciones restantes: ' + (2 - game.actions) + ' de 2';
  attackInfo.textContent = game.attacked ? 'Ataque usado' : game.actions === 2 ? 'Sin acciones para atacar' : 'Ataque disponible';
  const labels = { move: event => 'Moviste a ' + event.to, attack: () => 'Atacaste', prepare: () => 'Preparaste una carta',
    'summon-turn': event => 'Invocaste en ' + event.cell };
  const completed = [];
  for (let i = game.events.length - 1; i >= 0 && game.events[i].type !== 'turn'; i--) {
    const event = game.events[i];
    if (labels[event.type]) completed.unshift(labels[event.type](event));
  }
  if (completed.length) turnInfo.append(' · ' + completed.join(' · '));
}
function render() {
  if (game.phase === 'end' && ended === null) {
    ended = Date.now();
    clearInterval(matchClock);
  }
  updateClock();
  const active = ai.decisionSide(game, rules);
  const sideLabel = active === 'R' && mode === 'ai' ? 'la IA' : rules.SIDE[active];
  const phaseLabel = { reveal: 'Decisión', bonus: 'Avance', rescue: 'Rescate', summon: 'Invocación' }[game.phase];
  const notice = active ? (phaseLabel ?? 'Turno') + ' de ' + sideLabel : 'Partida terminada';
  byId('round').textContent = 'Ronda ' + game.round + ' de 12';
  byId('active-side').parentElement.dataset.side = active ?? game.winner ?? '';
  if (byId('active-side').textContent !== notice) byId('active-side').textContent = notice;
  byId('blue').textContent = rules.remaining(game, 'I');
  byId('red').textContent = rules.remaining(game, 'R');
  byId('blue-rescues').textContent = 'Rescates: ' + game.players.I.rescues;
  byId('red-rescues').textContent = 'Rescates: ' + game.players.R.rescues;
  renderTurnInfo();
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
  if (!game || dialog.open || byId('history-dialog').open || !isAITurn()) return;
  aiTimer = setTimeout(() => {
    aiTimer = null;
    if (!game || dialog.open || byId('history-dialog').open || !isAITurn()) return;
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
      case 'prepare': rules.prepare(game, 'R', action.handIndex, action.card); clearRevealed(); break;
      case 'summon-turn': rules.summonInTurn(game, 'R', action.piece); clearRevealed(); break;
      case 'skipBonus': rules.skipBonus(game); break;
    }
    render();
  }, game.phase === 'reveal' ? 650 : 440);
}
function resetPresentation() {
  clearTimeout(aiTimer);
  clearInterval(matchClock);
  drag?.ghost?.remove();
  drag = null;
  selection = null;
  choosingCannon = false;
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
  byId('history').hidden = false;
  started = Date.now();
  matchClock = setInterval(updateClock, 250);
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
  byId('history').hidden = true;
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
byId('history').addEventListener('click', () => byId('history-dialog').showModal());
byId('history-dialog').addEventListener('close', scheduleAI);
byId('export').addEventListener('click', () => {
  const data = { version: '0.11', mode, complete: game.phase === 'end', round: game.round,
    durationSeconds: started === null ? 0 : Math.floor(((ended ?? Date.now()) - started) / 1000),
    winner: game.winner, reason: game.reason, events: game.events };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'reales-ideales-partida.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});
