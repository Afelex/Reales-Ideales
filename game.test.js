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
  const s = setup(['boost']);
  stage(s);
  assert.equal(G.move(s, 'I1', 'A4'), false);
  reveal(s, null, 0);
  assert.equal(G.piece(s, 'I5').cell, 'C8');
  assert.equal(G.nextTurn(s), true);
  assert.equal(G.nextTurn(s), true);
  assert.equal(G.move(s, 'I1', 'A4'), true);
});

test('Combo de dos Refuerzos añade un +1 extraordinario', () => {
  const s = setup(['boost', 'boost']);
  stage(s);
  reveal(s, null, 0, null, 1);
  assert.deepEqual(result(s).force, [3, 0]);
  assert.equal(result(s).combos.I, 1);
  assert.equal(s.events.some(e => e.type === 'combo-card'), true);
});

test('Combo del defensor también aporta +1, incluso con Debilitar', () => {
  const s = setup([], ['weaken', 'weaken']);
  stage(s, false);
  reveal(s, 0, null, 1);
  assert.deepEqual(result(s).force, [0, 1]);
  assert.equal(result(s).combos.R, 1);
  assert.equal(G.piece(s, 'I5').cell, null);
  assert.equal(G.piece(s, 'R4').cell, 'C6');
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
  assert.equal(result(s).force[0], 2);
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

test('ganador al finalizar la ronda 12 según fichas supervivientes', () => {
  const s = setup();
  G.piece(s, 'R8').cell = null;
  for (let n = 0; n < 24; n++) assert.equal(G.nextTurn(s), true);
  assert.equal(s.round, 12);
  assert.equal(s.winner, 'I');
});

// === Reglas v0.15: base 0, cañón inmediato y ataques especiales ===
const ready = (s, side = 'I') => { s.players[side].charge = G.CHARGE_MAX; };

test('todas las fichas tienen fuerza base 0: sin cartas, el empate elimina a ambas', () => {
  const s = setup();
  stage(s, false);
  reveal(s);
  assert.deepEqual(result(s).force, [0, 0]);
  assert.equal(G.piece(s, 'I5').cell, null);
  assert.equal(G.piece(s, 'R4').cell, null);
  assert.equal(G.VANGUARD, undefined);
});

test('cada ficha conoce su animal', () => {
  const s = setup();
  assert.equal(G.piece(s, 'I5').animal, 'tigrillo');
  assert.equal(G.piece(s, 'R4').animal, 'gallo');
  assert.equal(Object.keys(G.SPECIALS).length, 8);
  for (const power of Object.values(G.SPECIALS)) assert.equal(power, G.FIRE_POWER);
});

test('un cañón ya formado ataca a cualquier distancia con +2', () => {
  const s = setup();
  G.piece(s, 'I1').cannon = true;
  assert.equal(G.attack(s, 'I1', 'R8'), true);
  reveal(s);
  assert.deepEqual(result(s).force, [2, 0]);
  assert.equal(s.phase, 'bonus');
});

test('Invocar cañón transforma al instante la ficha que combate y suma +2', () => {
  const s = setup(['cannon']);
  stage(s);
  assert.equal(G.reveal(s, null), true);
  assert.equal(G.reveal(s, 0), true);
  assert.equal(G.piece(s, 'I5').cannon, true);
  assert.equal(s.events.some(e => e.type === 'summon' && e.piece === 'I5'), true);
  assert.equal(G.reveal(s, null), true);
  assert.equal(G.reveal(s, null), true);
  assert.deepEqual(result(s).force, [2, 0]);
  assert.equal(s.phase, 'turn');
  assert.deepEqual(s.players.I.removed, ['cannon']);
  assert.equal(G.piece(s, 'I5').ready, s.players.I.ownTurns + 1);
});

test('el defensor también puede convertirse en cañón con Invocar cañón', () => {
  const s = setup([], ['cannon']);
  stage(s, false);
  reveal(s, 0);
  assert.equal(G.piece(s, 'R4').cannon, true);
  assert.deepEqual(result(s).force, [0, 2]);
  assert.equal(G.piece(s, 'R4').cell, 'C6');
});

test('la barra se llena 1/3 por turno propio: el ataque especial llega en el turno 3', () => {
  const s = setup();
  G.piece(s, 'I5').cell = 'C6';
  assert.equal(s.players.I.charge, 1);
  assert.deepEqual(G.specialOptions(s, 'I5'), []);
  G.nextTurn(s); G.nextTurn(s);
  assert.equal(s.players.I.charge, 2);
  assert.equal(s.players.R.charge, 1);
  assert.deepEqual(G.specialOptions(s, 'I5'), []);
  G.nextTurn(s); G.nextTurn(s);
  assert.equal(s.players.I.charge, 3);
  assert.deepEqual(G.specialOptions(s, 'I5'), [{ target: 'R4', at: 'C6' }]);
  G.nextTurn(s); G.nextTurn(s);
  assert.equal(s.players.I.charge, 3);
});

test('Fuego Especial: +3 y la barra vuelve a 0', () => {
  const s = setup();
  ready(s);
  G.piece(s, 'I5').cell = 'C6';
  assert.equal(G.specialAttack(s, 'I5', 'R4'), true);
  assert.equal(s.players.I.charge, 0);
  assert.equal(s.events.some(e => e.type === 'special' && e.power === 'Fuego Especial'), true);
  reveal(s);
  assert.deepEqual(result(s).force, [3, 0]);
  G.nextTurn(s);
  G.nextTurn(s);
  assert.equal(s.players.I.charge, 1);
});

test('el ataque especial exige barra llena, solo al atacar y nunca desde un cañón', () => {
  const s = setup();
  G.piece(s, 'I5').cell = 'C6';
  assert.equal(G.specialAttack(s, 'I5', 'R4'), false);
  ready(s);
  G.piece(s, 'I5').cannon = true;
  assert.deepEqual(G.specialOptions(s, 'I5'), []);
  G.piece(s, 'I5').cannon = false;
  assert.equal(G.attack(s, 'I5', 'R4'), true);
  assert.deepEqual(G.specialOptions(s, 'I5'), []);
});

test('los ocho animales de ambos bandos tienen el mismo Fuego Especial +3', () => {
  for (const side of ['I', 'R']) for (const animal of G.ROSTER[side]) {
    const s = setup();
    s.turn = side;
    ready(s, side);
    const fighter = s.pieces.find(p => p.side === side && p.animal === animal);
    const enemy = s.pieces.find(p => p.side !== side);
    for (const p of s.pieces) p.cell = null;
    fighter.cell = 'C6';
    enemy.cell = 'C8';
    assert.deepEqual(G.specialOptions(s, fighter.id), [{ target: enemy.id, at: 'C6' }]);
    assert.equal(G.specialAttack(s, fighter.id, enemy.id), true);
    assert.equal(s.actions, 1);
    assert.equal(s.attacked, true);
    assert.equal(s.moved.length, 0);
    assert.equal(fighter.cell, 'C6');
    assert.equal(s.players[side].charge, 0);
    assert.equal(G.cardLimit(s, side), 2);
    assert.equal(G.cardLimit(s, enemy.side), 2);
    reveal(s);
    assert.deepEqual(result(s).force, [3, 0]);
  }
});

test('Fuego Especial no permite alcance extra, saltos ni teletransporte', () => {
  for (const animal of G.ROSTER.I) {
    const s = setup();
    ready(s);
    const p = s.pieces.find(p => p.side === 'I' && p.animal === animal);
    const target = G.piece(s, 'R4');
    for (const q of s.pieces) q.cell = null;
    p.cell = 'C4';
    target.cell = 'C8';
    assert.deepEqual(G.specialOptions(s, p.id), []);
    assert.equal(G.specialAttack(s, p.id, target.id, 'C6'), false);
    assert.equal(G.specialAttack(s, p.id, target.id), false);
    assert.equal(s.players.I.charge, 3);
    assert.equal(p.cell, 'C4');
  }
});

test('Fuego Especial respeta cartas y combos ordinarios del defensor', () => {
  const s = setup([], ['major', 'major']);
  ready(s);
  G.piece(s, 'I8').cell = 'C6';
  assert.equal(G.specialAttack(s, 'I8', 'R4'), true);
  reveal(s, 0, null, 1, null);
  assert.deepEqual(result(s).force, [3, 5]);
  assert.equal(result(s).winner, 'R');
});

test('Fuego Especial no causa una segunda eliminación por sí mismo', () => {
  const s = setup();
  ready(s);
  G.piece(s, 'I1').cell = 'C6';
  G.piece(s, 'I5').cell = 'A4';
  G.piece(s, 'R2').cell = 'D7';
  assert.equal(G.specialAttack(s, 'I1', 'R4'), true);
  reveal(s);
  assert.deepEqual(result(s).removed, ['R4']);
  assert.equal(G.piece(s, 'R2').cell, 'D7');
  assert.equal(s.phase === 'combo', false);
});

test('el límite de tiempo prioriza fichas, cartas activadas y cartas poderosas', () => {
  const cases = [
    { loseR: true, I: [], R: ['major', 'cannon'], winner: 'I', criterion: 'pieces' },
    { I: ['boost', 'weaken'], R: ['decisive'], winner: 'I', criterion: 'cards' },
    { I: ['boost'], R: ['cannon'], winner: 'R', criterion: 'powerful' },
    { I: ['major'], R: ['decisive'], winner: null, criterion: undefined },
  ];
  for (const scenario of cases) {
    const s = setup(scenario.I, scenario.R);
    stage(s, false);
    const first = scenario.R.length ? 0 : null;
    const second = scenario.I.length ? 0 : null;
    assert.equal(G.reveal(s, first), true);
    assert.equal(G.reveal(s, second), true);
    if (scenario.loseR || scenario.I.length === 2) {
      assert.equal(G.reveal(s, scenario.R.length === 2 ? 1 : null), true);
      if (scenario.I.length === 2) {
        // Cuenta activaciones confirmadas independientemente del resultado del combate.
        assert.equal(G.reveal(s, 1), true);
        G.piece(s, 'I5').cell ||= 'C6';
      }
    }
    if (scenario.loseR) G.piece(s, 'R1').cell = null;
    assert.equal(G.finishOnTime(s), true);
    assert.equal(s.phase, 'end');
    assert.equal(s.winner, scenario.winner);
    assert.equal(s.timeResult.criterion, scenario.criterion);
    assert.deepEqual(s.events.slice(-2).map(event => event.type), ['time-cannon', 'end']);
    assert.equal(G.finishOnTime(s), false);
  }
});
