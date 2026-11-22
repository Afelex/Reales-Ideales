const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./game.js');

const setup = (I = [], R = []) => G.makeGame({ I: I.slice().reverse(), R: R.slice().reverse() });
const result = s => s.events.findLast(e => e.type === 'battle');
function stage(s, useMove = true) {
  if (useMove) assert.equal(G.move(s, 'I5', 'C6'), true);
  else G.piece(s, 'I5').cell = 'C6';
  assert.equal(G.attack(s, 'I5', 'R4'), true);
}
function reveal(s, d1 = null, a1 = null, d2 = null, a2 = null) {
  for (const card of [d1, a1, d2, a2]) assert.equal(G.reveal(s, card), true);
}

test('27 hexágonos, 8 piezas por bando, 28 cartas y reserva de tres', () => {
  const s = G.makeGame();
  assert.equal(Object.keys(G.CELLS).length, 27);
  assert.equal(G.remaining(s, 'I'), 8);
  assert.equal(G.remaining(s, 'R'), 8);
  assert.equal(G.HAND_SIZE, 3);
  assert.equal(G.CARDS.search.count, 4);
  assert.equal(Object.values(G.CARDS).reduce((n, c) => n + c.count, 0), 28);
  for (const side of ['I', 'R']) {
    assert.equal(s.players[side].hand.filter(Boolean).length, 3);
    assert.equal(s.players[side].deck.length, 25);
  }
});

test('un solo movimiento normal por turno y un ataque permitido', () => {
  const s = setup();
  stage(s);
  assert.equal(G.move(s, 'I1', 'A4'), false);
  reveal(s);
  assert.equal(G.piece(s, 'I5').cell, 'C8');
  assert.equal(G.nextTurn(s), true);
  assert.equal(G.nextTurn(s), true);
  assert.equal(G.move(s, 'I1', 'A4'), true);
});

test('vanguardia idealista I5 suma +2 de ataque al desplazarse', () => {
  const s = setup();
  stage(s);
  reveal(s);
  assert.deepEqual(result(s).force, [3, 0]);
  assert.equal(G.VANGUARD.I, 'I5');
});

test('vanguardia realista R4 suma +2 si ataca', () => {
  const s = setup();
  s.turn = 'R';
  G.piece(s, 'R4').cell = 'C6';
  assert.equal(G.attack(s, 'R4', 'I5'), true);
  reveal(s);
  assert.deepEqual(result(s).force, [3, 0]);
});

test('el cañón suma +2 de ataque a cualquier distancia', () => {
  const s = setup();
  G.piece(s, 'I1').cannon = true;
  assert.equal(G.attack(s, 'I1', 'R8'), true);
  reveal(s);
  assert.deepEqual(result(s).force, [3, 0]);
  assert.equal(s.phase, 'bonus');
});

test('el cañón reemplaza, no acumula, el bono de vanguardia', () => {
  const s = setup();
  G.piece(s, 'I5').cannon = true;
  stage(s, false);
  reveal(s);
  assert.deepEqual(result(s).force, [3, 0]);
});

test('invocación proporciona +1 durante el combate y crea cañón después', () => {
  const s = setup(['cannon']);
  stage(s);
  reveal(s, null, 0);
  assert.deepEqual(result(s).force, [4, 0]);
  assert.equal(s.phase, 'summon');
  assert.equal(G.summon(s, 'I5'), true);
  assert.equal(G.piece(s, 'I5').cannon, true);
  assert.deepEqual(s.players.I.removed, ['cannon']);
});

test('Combo de dos Refuerzos añade un +1 extraordinario', () => {
  const s = setup(['boost', 'boost']);
  stage(s);
  reveal(s, null, 0, null, 1);
  assert.deepEqual(result(s).force, [6, 0]);
  assert.equal(result(s).combos.I, 1);
  assert.equal(s.events.some(e => e.type === 'combo-card'), true);
});

test('Combo del defensor también aporta +1, incluso con Debilitar', () => {
  const s = setup([], ['weaken', 'weaken']);
  stage(s, false);
  reveal(s, 0, null, 1);
  assert.deepEqual(result(s).force, [1, 1]);
  assert.equal(result(s).combos.R, 1);
  assert.equal(G.piece(s, 'I5').cell, null);
  assert.equal(G.piece(s, 'R4').cell, null);
});

test('un Golpe decisivo por bando se neutraliza', () => {
  const s = setup(['decisive'], ['decisive']);
  stage(s, false);
  reveal(s, 0, 0);
  assert.equal(result(s).advantage, 0);
  assert.equal(s.phase, 'turn');
});

test('dos decisivos superan a un decisivo enemigo', () => {
  const s = setup(['decisive', 'decisive'], ['decisive']);
  stage(s, false);
  reveal(s, 0, 0, null, 1);
  assert.equal(result(s).advantage, 1);
  assert.equal(s.phase, 'combo');
});

test('Combo decisivo atacante elimina dos objetivos y valida la selección', () => {
  const s = setup(['decisive', 'decisive']);
  stage(s);
  reveal(s, null, 0, null, 1);
  assert.equal(s.phase, 'combo');
  assert.equal(G.comboTargets(s).includes('R3'), true);
  assert.equal(G.comboEliminate(s, 'I1'), false);
  assert.equal(G.comboEliminate(s, 'R3'), true);
  assert.equal(G.remaining(s, 'R'), 6);
  assert.equal(G.piece(s, 'R4').cell, null);
  assert.equal(G.piece(s, 'R3').cell, null);
  assert.equal(G.piece(s, 'I5').cell, 'C8');
});

test('Combo decisivo defensor elimina atacante y una ficha adicional', () => {
  const s = setup([], ['decisive', 'decisive']);
  stage(s, false);
  reveal(s, 0, null, 1);
  assert.equal(s.battle.combo.side, 'R');
  assert.equal(G.comboEliminate(s, 'I1'), true);
  assert.equal(G.piece(s, 'I5').cell, null);
  assert.equal(G.piece(s, 'I1').cell, null);
  assert.equal(G.piece(s, 'R4').cell, 'C6');
});

test('la segunda eliminación es opcional', () => {
  const s = setup(['decisive', 'decisive']);
  stage(s, false);
  reveal(s, null, 0, null, 1);
  assert.equal(G.comboEliminate(s, null), true);
  assert.equal(G.remaining(s, 'R'), 7);
  assert.equal(s.phase, 'turn');
});

test('Combo decisivo puede terminar por eliminación total', () => {
  const s = setup(['decisive', 'decisive']);
  for (const p of s.pieces) if (p.side === 'R' && !['R3', 'R4'].includes(p.id)) p.cell = null;
  stage(s, false);
  reveal(s, null, 0, null, 1);
  assert.equal(G.comboEliminate(s, 'R3'), true);
  assert.equal(s.phase, 'end');
  assert.equal(s.winner, 'I');
});

test('Exploración exige una selección válida y ocupa su ranura tras la batalla', () => {
  const s = setup();
  s.players.I.hand = ['search', 'boost', 'major'];
  s.players.I.deck = ['decisive', 'major'];
  stage(s, false);
  assert.equal(G.reveal(s, null), true);
  assert.deepEqual(G.searchOptions(s, 'I'), ['major', 'decisive']);
  assert.equal(G.reveal(s, 0), false);
  assert.equal(G.reveal(s, 0, 'cannon'), false);
  assert.equal(G.reveal(s, 0, 'decisive'), true);
  assert.equal(s.players.I.hand[0], null);
  assert.equal(G.reveal(s, null), true);
  assert.equal(G.reveal(s, 0), false);
  assert.equal(G.reveal(s, 1), true);
  assert.equal(s.players.I.hand[0], 'decisive');
  assert.equal(s.players.I.deck.includes('decisive'), false);
  assert.equal(result(s).force[0], 5);
});

test('dos Exploraciones reservan dos cartas distintas disponibles en el mazo', () => {
  const s = setup();
  s.players.I.hand = ['search', 'search', 'boost'];
  s.players.I.deck = ['decisive', 'major'];
  stage(s, false);
  assert.equal(G.reveal(s, null), true);
  assert.equal(G.reveal(s, 0, 'decisive'), true);
  assert.equal(G.reveal(s, null), true);
  assert.deepEqual(G.searchOptions(s, 'I'), ['major']);
  assert.equal(G.reveal(s, 1, 'decisive'), false);
  assert.equal(G.reveal(s, 1, 'major'), true);
  assert.equal(s.players.I.hand[0], 'decisive');
  assert.equal(s.players.I.hand[1], 'major');
  assert.equal(result(s).combos.I, 1);
});

test('no se puede jugar la tercera carta en el mismo enfrentamiento', () => {
  const s = setup(['boost', 'boost', 'boost']);
  stage(s, false);
  reveal(s, null, 0, null, 1);
  const activated = s.events.filter(e => e.type === 'reveal' && e.side === 'I');
  assert.equal(activated.length, 2);
  assert.equal(G.reveal(s, 2), false);
});

test('se rellena la reserva sin reemplazar la carta no utilizada', () => {
  const s = setup(['boost', 'major', 'weaken', 'decisive', 'search']);
  const saved = s.players.I.hand[2];
  stage(s, false);
  reveal(s, null, 0, null, 1);
  assert.equal(s.players.I.hand.filter(Boolean).length, 3);
  assert.equal(s.players.I.hand[2], saved);
  assert.equal(s.events.some(e => e.type === 'draw' && e.side === 'I'), true);
});

test('rescate y transformación en cañón se resuelven ordenadamente', () => {
  const s = setup(['cannon']);
  G.piece(s, 'I5').cell = 'B9';
  G.piece(s, 'I1').cell = null;
  assert.equal(G.attack(s, 'I5', 'R3'), true);
  reveal(s, null, 0);
  assert.equal(s.phase, 'rescue');
  assert.equal(G.rescue(s, 'I1', 'A2'), true);
  assert.equal(s.phase, 'summon');
  assert.equal(G.summon(s, 'I1'), true);
  assert.equal(G.piece(s, 'I1').cannon, true);
});

test('ganador al finalizar la ronda 12 según fichas supervivientes', () => {
  const s = setup();
  G.piece(s, 'R8').cell = null;
  for (let n = 0; n < 24; n++) assert.equal(G.nextTurn(s), true);
  assert.equal(s.round, 12);
  assert.equal(s.winner, 'I');
});
