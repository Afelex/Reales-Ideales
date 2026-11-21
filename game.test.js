const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./game.js');

function setup(blue = [], red = []) {
  return G.makeGame({ I: blue.slice().reverse(), R: red.slice().reverse() });
}
function stageBattle(s) {
  assert.equal(G.move(s, 'I5', 'C6'), true);
  assert.equal(G.attack(s, 'I5', 'R4'), true);
}
function play(s, ...choices) {
  assert.equal(choices.length, 4);
  for (const index of choices) assert.equal(G.reveal(s, index), true);
}

test('preparar intercambia una carta en privado y solo se permite una vez por bando', () => {
  const s = setup(['boost', 'weaken', 'major', 'cannon'], ['boost', 'major', 'decisive']);
  assert.deepEqual(G.preparationChoices(s, 'I', 0), ['major', 'cannon']);
  assert.equal(G.prepare(s, 'R', 0, 'decisive'), false);
  assert.equal(G.prepare(s, 'I', 0, 'decisive'), false);
  assert.equal(s.actions, 0);
  assert.equal(G.prepare(s, 'I', 0, 'major'), true);
  assert.deepEqual(s.players.I.hand, ['major', 'weaken']);
  assert.deepEqual(s.players.I.deck.slice().sort(), ['boost', 'cannon']);
  assert.equal(s.actions, 1);
  assert.equal(s.events.at(-1).type, 'prepare');
  assert.equal(s.events.at(-1).card, undefined);
  assert.equal(G.prepare(s, 'I', 1, 'cannon'), false);
  assert.equal(G.move(s, 'I5', 'C6'), true);
  assert.equal(G.attack(s, 'I5', 'R4'), false);
  G.nextTurn(s);
  assert.equal(G.prepare(s, 'R', 0, 'decisive'), true);
  G.nextTurn(s);
  assert.deepEqual(G.preparationChoices(s, 'I', 1), []);
});

test('la invocación de turno consume carta y acción y permite disparar desde el turno siguiente', () => {
  const s = setup(['cannon', 'boost', 'cannon', 'major']);
  assert.equal(G.summonInTurn(s, 'I', 'R4'), false);
  assert.equal(G.summonInTurn(s, 'I', 'I1'), true);
  assert.equal(G.piece(s, 'I1').cell, 'A2');
  assert.equal(G.piece(s, 'I1').cannon, true);
  assert.deepEqual(s.players.I.hand, ['boost', 'cannon']);
  assert.deepEqual(s.players.I.removed, ['cannon']);
  assert.equal(s.actions, 1);
  assert.deepEqual(G.attacks(s, 'I1'), []);
  assert.equal(G.summonInTurn(s, 'I', 'I2'), false);
  G.nextTurn(s);
  G.nextTurn(s);
  assert.equal(G.attacks(s, 'I1').length, 8);
  assert.equal(G.attack(s, 'I1', 'R4'), true);
  assert.equal(G.summonInTurn(s, 'I', 'I2'), false);
  assert.deepEqual(G.preparationChoices(s, 'I', 0), []);
});

test('tablero, fuerzas iniciales y límites de turno', () => {
  const s = G.makeGame();
  assert.equal(Object.keys(G.CELLS).length, 27);
  assert.deepEqual(['I', 'R'].map(side => G.remaining(s, side)), [8, 8]);
  assert.equal(s.players.I.deck.length + s.players.I.hand.length, 24);
  assert.equal(s.turn, 'I');
  assert.equal(G.attack(s, 'I5', 'R4'), false);
  stageBattle(s);
  play(s, null, null, null, null);
  assert.equal(G.piece(s, 'I5').cell, 'C8');
  assert.equal(G.piece(s, 'R4').cell, null);
  assert.equal(G.move(s, 'I5', 'C6'), false);
});

test('se puede pasar y revelar después, con retirada de ambas fichas en empate', () => {
  const s = setup([], ['boost']);
  stageBattle(s);
  play(s, null, null, 0, null);
  assert.equal(G.piece(s, 'I5').cell, null);
  assert.equal(G.piece(s, 'R4').cell, null);
  assert.equal(s.phase, 'turn');
});

test('dos golpes decisivos se anulan y dejan aplicar los modificadores', () => {
  const s = setup(['decisive'], ['decisive', 'major']);
  stageBattle(s);
  play(s, 0, 0, 0, null);
  assert.equal(G.piece(s, 'I5').cell, null);
  assert.equal(G.piece(s, 'R4').cell, 'C6');
});

test('el cañón puede perder a distancia y el defensor gana un movimiento extra', () => {
  const s = setup([], ['major']);
  const cannon = G.piece(s, 'I1');
  cannon.cannon = true;
  assert.equal(G.attack(s, 'I1', 'R8'), true);
  play(s, 0, null, null, null);
  assert.equal(cannon.cell, null);
  assert.equal(s.phase, 'bonus');
  assert.equal(G.move(s, 'R4', 'C6'), true);
  assert.equal(s.actions, 1);
  assert.equal(G.piece(s, 'R4').cell, 'C6');
});

test('el cañón ganado a distancia puede dar un rescate incluso a quien defiende', () => {
  const s = setup(['cannon', 'boost'], ['major']);
  const cannon = G.piece(s, 'I1');
  cannon.cannon = true;
  G.piece(s, 'R2').cell = 'B3';
  const defeated = G.piece(s, 'R1');
  defeated.cell = null;
  defeated.cannon = true;
  G.piece(s, 'I2').cell = null;
  assert.equal(G.attack(s, 'I1', 'R8'), true);
  assert.equal(G.reveal(s, 0), true);
  assert.equal(G.reveal(s, 0), false);
  playRemaining();
  function playRemaining() {
    assert.equal(G.reveal(s, null), true);
    assert.equal(G.reveal(s, null), true);
    assert.equal(G.reveal(s, null), true);
  }
  assert.equal(G.move(s, 'R2', 'B1'), true);
  assert.equal(s.phase, 'rescue');
  assert.equal(G.rescue(s, 'R1', 'A10'), true);
  assert.equal(defeated.cannon, false);
  assert.equal(s.players.R.rescues, 1);
});

test('rescatar antes de invocar permite elegir la ficha recuperada', () => {
  const s = setup(['cannon', 'cannon']);
  G.piece(s, 'I5').cell = 'B9';
  G.piece(s, 'I1').cell = null;
  assert.equal(G.attack(s, 'I5', 'R3'), true);
  assert.equal(G.reveal(s, null), true);
  assert.equal(G.reveal(s, 0), true);
  assert.equal(G.reveal(s, null), true);
  assert.equal(G.reveal(s, 0), false);
  assert.equal(G.reveal(s, null), true);
  assert.equal(s.phase, 'rescue');
  assert.equal(G.rescue(s, 'I1', 'A2'), true);
  assert.equal(s.phase, 'summon');
  assert.equal(G.summon(s, 'I1'), true);
  assert.equal(s.players.I.removed.length, 1);
  assert.equal(G.piece(s, 'I1').cannon, true);
  assert.equal(G.attacks(s, 'I1').length, 0);
  G.nextTurn(s);
  G.nextTurn(s);
  assert.equal(G.attacks(s, 'I1').length, 7);
});

test('recicla el descarte personal y excluye la invocación', () => {
  const s = setup(['boost', 'cannon']);
  stageBattle(s);
  play(s, null, 0, null, 0);
  assert.equal(G.summon(s, 'I5'), true);
  assert.deepEqual(s.players.I.removed, ['cannon']);
  assert.deepEqual(s.players.I.hand, ['boost']);
});

test('una baja de última ficha cierra la partida antes del avance', () => {
  const s = setup();
  for (const p of s.pieces) if (p.side === 'R' && p.id !== 'R4') p.cell = null;
  stageBattle(s);
  play(s, null, null, null, null);
  assert.equal(s.winner, 'I');
  assert.equal(s.phase, 'end');
  assert.equal(G.piece(s, 'I5').cell, 'C6');
});

test('al terminar la ronda 12 gana quien conserva más fichas', () => {
  const s = setup();
  G.piece(s, 'R8').cell = null;
  for (let n = 0; n < 24; n++) assert.equal(G.nextTurn(s), true);
  assert.equal(s.round, 12);
  assert.equal(s.winner, 'I');
  assert.equal(s.reason, 'límite de rondas');
});

test('ambas facciones pueden invocar en una batalla y coexistir con un cañón cada una', () => {
  const s = setup(['cannon', 'cannon'], ['cannon', 'cannon']);
  stageBattle(s);
  play(s, 0, 0, null, null);
  assert.deepEqual(s.summons, ['R', 'I']);
  assert.equal(G.summon(s, 'R3'), true);
  assert.equal(G.summon(s, 'I5'), true);
  assert.deepEqual(s.pieces.filter(p => p.cannon).map(p => p.id), ['I5', 'R3']);
  assert.deepEqual(s.players.I.hand, ['cannon']);
  assert.deepEqual(s.players.R.hand, ['cannon']);
  G.nextTurn(s);
  assert.equal(G.attack(s, 'R3', 'I1'), true);
  assert.equal(G.reveal(s, 0), false);
  assert.equal(G.reveal(s, null), true);
  assert.equal(G.reveal(s, 0), false);
});
