'use strict';

const rules = window.RealesIdeales;
const byId = id => document.getElementById(id);
const board = byId('board');
const actions = byId('actions');
const hexButtons = new Map();
let game = rules.makeGame();
let selection = null;
let privateHand = false;
let started = null;
let ended = null;

for (const cell of Object.values(rules.CELLS)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hex';
  button.dataset.zone = cell.zone;
  button.style.left = (12.5 + cell.col * 18.75) + '%';
  button.style.top = (cell.row / 12 * 100) + '%';
  button.addEventListener('click', () => clickCell(cell.id));
  hexButtons.set(cell.id, button);
  board.append(button);
}
function addButton(label, action, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', action);
  actions.append(button);
  return button;
}
function badge(parent, className, value) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = value;
  parent.append(span);
}
function choices() {
  return {
    moves: selection ? rules.moves(game, selection) : [],
    targets: selection ? rules.attacks(game, selection) : [],
  };
}
function clickCell(cell) {
  privateHand = false;
  const occupant = rules.occupant(game, cell);
  const { moves, targets } = choices();
  if (game.phase === 'summon') {
    if (occupant) rules.summon(game, occupant.id);
  } else if (game.phase === 'rescue') {
    if (selection && !occupant) rules.rescue(game, selection, cell);
  } else if (game.phase === 'turn' || game.phase === 'bonus') {
    if (moves.includes(cell)) {
      started ??= Date.now();
      rules.move(game, selection, cell);
      selection = null;
    } else if (occupant && targets.includes(occupant.id)) {
      started ??= Date.now();
      rules.attack(game, selection, occupant.id);
      selection = null;
      privateHand = false;
    } else {
      const owner = game.phase === 'bonus' ? game.battle.winner : game.turn;
      if (occupant?.side === owner) selection = selection === occupant.id ? null : occupant.id;
    }
  }
  render();
}
function renderBoard() {
  const { moves, targets } = choices();
  for (const [id, button] of hexButtons) {
    const occupant = rules.occupant(game, id);
    const star = rules.STARS.I.includes(id) || rules.STARS.R.includes(id);
    let target = moves.includes(id) ? 'move' : targets.includes(occupant?.id) ? 'target' : '';
    if (game.phase === 'rescue' && selection && !occupant && rules.ZONES[game.rescue.side].includes(id)) target = 'move';
    if (game.phase === 'summon' && occupant?.side === game.summons[0]) target = 'move';
    button.dataset.highlight = target;
    button.setAttribute('aria-pressed', String(Boolean(occupant && occupant.id === selection)));
    button.setAttribute('aria-label', [id, star ? 'estrella de rescate' : '', occupant
      ? rules.SIDE[occupant.side] + ' ' + occupant.id + (occupant.cannon ? ', cañón' : '') : 'libre',
      target === 'target' ? 'objetivo de ataque' : target === 'move' ? 'opción disponible' : ''].filter(Boolean).join(', '));
    button.replaceChildren();
    if (star) badge(button, 'star', '★');
    if (occupant) badge(button, 'token ' + occupant.side, occupant.cannon ? '◆' : occupant.id);
    badge(button, 'coordinate', id);
  }
}
function say(title, message) {
  byId('phase-title').textContent = title;
  byId('instructions').textContent = message;
}
function renderControls() {
  actions.replaceChildren();
  switch (game.phase) {
    case 'turn':
      say('Turno de ' + rules.SIDE[game.turn], game.actions === 2 ? 'Ya completaste tus dos acciones.'
        : selection ? selection + ' seleccionada. Elige una casilla dorada para mover o una ficha con fondo rojo para atacar.'
          : 'Elige una ficha propia. Puedes mover o atacar.');
      addButton('Terminar turno', () => {
        selection = null;
        privateHand = false;
        started ??= Date.now();
        rules.nextTurn(game);
        render();
      }, 'secondary');
      addButton(privateHand ? 'Ocultar mis cartas' : 'Ver mis cartas', () => {
        privateHand = !privateHand;
        render();
      }, 'secondary');
      if (privateHand) {
        const hand = document.createElement('p');
        hand.className = 'instructions';
        hand.textContent = game.players[game.turn].hand.map(id => rules.CARDS[id].name).join(', ');
        actions.append(hand);
      }
      break;
    case 'reveal': {
      const side = rules.actor(game);
      const role = side === game.battle.defender ? 'Defensa' : 'Ataque';
      say(role + ' · ' + rules.SIDE[side], privateHand
        ? 'Revela una carta preparada o pasa.'
        : 'Entrega el dispositivo a ' + rules.SIDE[side].toLowerCase() + ' para que vean sus cartas.');
      if (!privateHand) {
        addButton('Ver mis cartas', () => { privateHand = true; render(); });
        break;
      }
      game.players[side].hand.forEach((id, index) => {
        const card = rules.CARDS[id];
        const button = addButton(card.name, () => play(index), 'card');
        const desc = document.createElement('small');
        desc.textContent = card.description;
        button.append(desc);
        button.disabled = !rules.playable(game, side, id);
        if (button.disabled) desc.textContent = 'Ya hay un cañón en juego o una invocación en esta batalla.';
      });
      addButton('Pasar', () => play(null), 'secondary');
      break;
    }
    case 'bonus':
      say('Avance de ' + rules.SIDE[game.battle.winner], 'Elige una ficha propia y una casilla libre vecina.');
      addButton('Omitir avance', () => {
        selection = null;
        rules.skipBonus(game);
        render();
      }, 'secondary');
      break;
    case 'rescue':
      say('Rescate de ' + rules.SIDE[game.rescue.side], selection
        ? 'Coloca a ' + selection + ' en una de tus casillas de despliegue libres.'
        : 'Elige la ficha que volverá al tablero como ficha normal.');
      game.pieces.filter(p => !p.cell && p.side === game.rescue.side).forEach(p =>
        addButton('Rescatar ' + p.id, () => { selection = p.id; render(); }));
      addButton('Guardar marcador', () => { rules.rescue(game, null); selection = null; render(); }, 'secondary');
      break;
    case 'summon':
      say('Cañón de ' + rules.SIDE[game.summons[0]], 'Elige una de tus fichas en el tablero. Atacará desde tu siguiente turno.');
      break;
    case 'end':
      say(game.winner ? 'Ganan los ' + rules.SIDE[game.winner].toLowerCase() : 'Empate',
        game.reason === 'eliminación' ? 'Partida decidida por las últimas fichas.' : 'Se completaron las 12 rondas.');
      break;
  }
}
function play(index) {
  if (!rules.reveal(game, index)) return;
  privateHand = false;
  render();
}
function render() {
  if (game.phase === 'end' && ended === null) ended = Date.now();
  byId('round').textContent = game.round + ' / 12';
  byId('blue').textContent = rules.remaining(game, 'I');
  byId('red').textContent = rules.remaining(game, 'R');
  byId('blue-rescues').textContent = 'Rescates: ' + game.players.I.rescues;
  byId('red-rescues').textContent = 'Rescates: ' + game.players.R.rescues;
  byId('turn-info').textContent = game.phase === 'reveal' ? 'Carta o pase ' + (game.battle.slot + 1) + ' de 4'
    : game.phase === 'turn' ? 'Acciones: ' + game.actions + ' de 2' : '';
  renderBoard();
  renderControls();
  byId('log').replaceChildren(...game.events.slice(-8).reverse().map(event => {
    const item = document.createElement('li');
    item.textContent = event.text;
    return item;
  }));
}
byId('restart').addEventListener('click', () => {
  if (game.events.length > 1 && game.phase !== 'end' && !window.confirm('¿Empezar una partida nueva?')) return;
  game = rules.makeGame();
  selection = null;
  privateHand = false;
  started = null;
  ended = null;
  render();
});
byId('export').addEventListener('click', () => {
  const data = { version: '0.5', complete: game.phase === 'end', round: game.round,
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
