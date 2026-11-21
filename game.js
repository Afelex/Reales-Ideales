(function () {
  'use strict';

  const SIDE = { I: 'Idealistas', R: 'Realistas' };
  const CARDS = {
    boost: { name: 'Refuerzo', count: 8, own: 1, description: 'Suma 1 a tu fuerza.' },
    weaken: { name: 'Debilitar', count: 8, rival: -1, description: 'Resta 1 a la fuerza rival.' },
    major: { name: 'Refuerzo mayor', count: 4, own: 2, description: 'Suma 2 a tu fuerza.' },
    decisive: { name: 'Golpe decisivo', count: 2, description: 'Gana. Si ambos lo juegan, se anulan.' },
    cannon: { name: 'Invocar cañón', count: 2, description: 'Transforma una ficha propia por 1 acción en tu turno. También puedes revelarla durante una batalla. El cañón dispara desde tu próximo turno.' },
  };
  const CELLS = {};
  const ZONES = {
    I: ['A2', 'B1', 'B3', 'C2', 'C4', 'D1', 'D3', 'E2'],
    R: ['A10', 'B9', 'B11', 'C8', 'C10', 'D9', 'D11', 'E10'],
  };
  const STARS = { I: ['B11', 'D11'], R: ['B1', 'D1'] };
  for (const [col, letter] of [...'ABCDE'].entries()) {
    for (let row = col % 2 ? 1 : 2; row <= 11; row += 2) {
      const id = letter + row;
      CELLS[id] = { id, col, row, zone: ZONES.I.includes(id) ? 'I' : ZONES.R.includes(id) ? 'R' : 'N' };
    }
  }

  const opponent = side => side === 'I' ? 'R' : 'I';
  function adjacent(a, b) {
    const x = CELLS[a], y = CELLS[b];
    if (!x || !y) return false;
    const cols = Math.abs(x.col - y.col), rows = Math.abs(x.row - y.row);
    return (cols === 0 && rows === 2) || (cols === 1 && rows === 1);
  }
  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
  function draw(player) {
    while (player.hand.length < 2) {
      if (!player.deck.length) player.deck = shuffle(player.discard.splice(0));
      if (!player.deck.length) break;
      player.hand.push(player.deck.pop());
    }
  }
  function makePlayer(deck) {
    const player = { deck: deck.slice(), hand: [], discard: [], removed: [], rescues: 2, ownTurns: 0, prepared: false };
    draw(player);
    return player;
  }
  function makeGame(decks = {}) {
    const deck = () => shuffle(Object.entries(CARDS).flatMap(([id, card]) => Array(card.count).fill(id)));
    const state = {
      players: { I: makePlayer(decks.I ?? deck()), R: makePlayer(decks.R ?? deck()) },
      pieces: Object.entries(ZONES).flatMap(([side, cells]) =>
        cells.map((cell, i) => ({ id: side + (i + 1), side, cell, cannon: false, ready: 0 }))),
      turn: 'I', round: 1, actions: 0, attacked: false, moved: [],
      phase: 'turn', battle: null, rescue: null, summons: [], winner: null, reason: null, events: [],
    };
    state.players.I.ownTurns = 1;
    record(state, 'turn', { side: 'I', text: 'Turno idealista.' });
    return state;
  }
  function record(s, type, fields) {
    s.events.push({ type, round: s.round, turn: s.turn, ...fields });
  }
  const piece = (s, id) => s.pieces.find(p => p.id === id);
  const occupant = (s, cell) => s.pieces.find(p => p.cell === cell);
  const remaining = (s, side) => s.pieces.filter(p => p.side === side && p.cell).length;
  const hasAction = (s, side) => s.phase === 'turn' && s.turn === side && s.actions < 2;
  const hasCannon = (s, side) => s.pieces.some(p => p.side === side && p.cell && p.cannon);

  function preparationChoices(s, side, handIndex) {
    if (!hasAction(s, side)) return [];
    const player = s.players[side];
    const exchanged = player.hand[handIndex];
    if (player.prepared || !exchanged) return [];
    return Object.keys(CARDS).filter(card => card !== exchanged && player.deck.includes(card));
  }
  function prepare(s, side, handIndex, card) {
    if (!preparationChoices(s, side, handIndex).includes(card)) return false;
    const player = s.players[side];
    const index = player.deck.indexOf(card);
    player.deck[index] = player.hand[handIndex];
    player.hand[handIndex] = card;
    shuffle(player.deck);
    player.prepared = true;
    s.actions++;
    record(s, 'prepare', { side, text: SIDE[side] + ' preparan una carta.' });
    return true;
  }
  function canSummonInTurn(s, side) {
    return hasAction(s, side) && s.players[side].hand.includes('cannon') && !hasCannon(s, side);
  }
  function summonInTurn(s, side, id) {
    const p = piece(s, id);
    if (!canSummonInTurn(s, side) || !p?.cell || p.side !== side) return false;
    const player = s.players[side];
    player.hand.splice(player.hand.indexOf('cannon'), 1);
    player.removed.push('cannon');
    s.actions++;
    placeCannon(s, p);
    record(s, 'summon-turn', { side, piece: p.id, cell: p.cell, text: p.id + ' se convierte en cañón.' });
    draw(player);
    return true;
  }

  function moves(s, id) {
    const p = piece(s, id);
    const allowed = p?.cell && (s.phase === 'bonus' ? s.battle.winner === p.side
      : hasAction(s, p.side) && !s.moved.includes(id));
    return allowed ? Object.keys(CELLS).filter(cell => adjacent(p.cell, cell) && !occupant(s, cell)) : [];
  }
  function attacks(s, id) {
    const p = piece(s, id);
    if (!p?.cell || !hasAction(s, p.side) || s.attacked) return [];
    if (p.cannon && s.players[p.side].ownTurns < p.ready) return [];
    return s.pieces.filter(q => q.cell && q.side !== p.side && (p.cannon || adjacent(p.cell, q.cell))).map(q => q.id);
  }
  function entry(s, p, cell, after, type) {
    const from = p.cell;
    p.cell = cell;
    record(s, type, { side: p.side, piece: p.id, from, to: cell, text: p.id + ' avanza de ' + from + ' a ' + cell + '.' });
    if (STARS[p.side].includes(cell) && s.players[p.side].rescues &&
        s.pieces.some(q => q.side === p.side && !q.cell) && ZONES[p.side].some(c => !occupant(s, c))) {
      s.phase = 'rescue';
      s.rescue = { side: p.side, after };
    } else continueAfterEntry(s, after);
  }
  function continueAfterEntry(s, after) {
    if (after === 'battle') startSummons(s);
    else s.phase = 'turn';
  }
  function move(s, id, cell) {
    if (!moves(s, id).includes(cell)) return false;
    const bonus = s.phase === 'bonus';
    if (!bonus) {
      s.actions++;
      s.moved.push(id);
    }
    entry(s, piece(s, id), cell, bonus ? 'battle' : 'turn', bonus ? 'bonus' : 'move');
    return true;
  }
  function rescue(s, id, cell) {
    if (s.phase !== 'rescue') return false;
    const { side, after } = s.rescue;
    if (id !== null) {
      const p = piece(s, id);
      if (!p || p.cell || p.side !== side || !ZONES[side].includes(cell) || occupant(s, cell)) return false;
      p.cell = cell;
      p.cannon = false;
      p.ready = 0;
      s.players[side].rescues--;
      record(s, 'rescue', { side, piece: id, to: cell, text: SIDE[side] + ' rescatan a ' + id + ' en ' + cell + '.' });
    }
    s.rescue = null;
    continueAfterEntry(s, after);
    return true;
  }
  function attack(s, id, target) {
    if (!attacks(s, id).includes(target)) return false;
    const a = piece(s, id), d = piece(s, target);
    s.actions++;
    s.attacked = true;
    s.battle = { a: id, d: target, attacker: a.side, defender: d.side, nearby: adjacent(a.cell, d.cell),
      slot: 0, played: { I: [], R: [] }, startedWithCannon: {
        I: hasCannon(s, 'I'),
        R: hasCannon(s, 'R'),
      } };
    s.phase = 'reveal';
    record(s, 'attack', { side: a.side, piece: id, target, nearby: s.battle.nearby, text: id + ' ataca a ' + target + '.' });
    return true;
  }
  const actor = s => s.battle.slot % 2 ? s.battle.attacker : s.battle.defender;
  function playable(s, side, card) {
    return card !== 'cannon' || (!s.battle.startedWithCannon[side] && !s.battle.played[side].includes(card));
  }
  function reveal(s, index) {
    if (s.phase !== 'reveal') return false;
    const side = actor(s);
    if (index !== null) {
      const hand = s.players[side].hand;
      const card = hand[index];
      if (!card || !playable(s, side, card)) return false;
      hand.splice(index, 1);
      s.battle.played[side].push(card);
      record(s, 'reveal', { side, card, text: SIDE[side] + ' revelan ' + CARDS[card].name + '.' });
    } else record(s, 'pass', { side, text: SIDE[side] + ' pasan.' });
    s.battle.slot++;
    if (s.battle.slot === 4) resolveBattle(s);
    return true;
  }
  function strength(own, rival, base) {
    return Math.max(0, own.reduce((sum, id) => sum + (CARDS[id].own ?? 0), base)
      + rival.reduce((sum, id) => sum + (CARDS[id].rival ?? 0), 0));
  }
  function resolveBattle(s) {
    const b = s.battle;
    const a = piece(s, b.a), d = piece(s, b.d);
    const ac = b.played[a.side], dc = b.played[d.side];
    const af = strength(ac, dc, 1), df = strength(dc, ac, 0);
    const decisive = Number(ac.includes('decisive')) - Number(dc.includes('decisive'));
    const difference = decisive || af - df;
    const winner = difference > 0 ? a : difference < 0 ? d : null;
    const loser = winner === a ? d : a;
    const cleared = loser.cell;
    const removed = winner ? [loser] : [a, d];
    for (const p of removed) {
      p.cell = null;
      p.cannon = false;
      p.ready = 0;
    }
    b.winner = winner?.side ?? null;
    record(s, 'battle', { attacker: a.side, defender: d.side, nearby: b.nearby, advantage: decisive,
      force: [af, df], winner: b.winner, removed: removed.map(p => p.id),
      text: winner ? 'Vence ' + winner.id + '. Sale ' + loser.id + '.' : 'Empate. Salen ' + a.id + ' y ' + d.id + '.' });
    const blue = remaining(s, 'I'), red = remaining(s, 'R');
    if (!blue || !red) {
      finish(s, blue ? 'I' : red ? 'R' : null, 'eliminación');
    } else if (winner && b.nearby) {
      entry(s, winner, cleared, 'battle', 'advance');
    } else if (winner) {
      s.phase = 'bonus';
    } else startSummons(s);
  }
  function skipBonus(s) {
    if (s.phase !== 'bonus') return false;
    startSummons(s);
    return true;
  }
  function startSummons(s) {
    s.summons = [s.battle.defender, s.battle.attacker].filter(side => s.battle.played[side].includes('cannon'));
    if (s.summons.length) s.phase = 'summon';
    else replenish(s);
  }
  function summon(s, id) {
    if (s.phase !== 'summon') return false;
    const p = piece(s, id);
    const side = s.summons[0];
    if (!p?.cell || p.side !== side || p.cannon) return false;
    placeCannon(s, p);
    s.summons.shift();
    record(s, 'summon', { side, piece: id, cell: p.cell, text: p.id + ' se convierte en cañón.' });
    if (!s.summons.length) replenish(s);
    return true;
  }
  function placeCannon(s, p) {
    p.cannon = true;
    p.ready = s.players[p.side].ownTurns + 1;
  }
  function replenish(s) {
    for (const side of ['I', 'R']) {
      const player = s.players[side];
      for (const card of s.battle.played[side]) {
        (card === 'cannon' ? player.removed : player.discard).push(card);
      }
      draw(player);
    }
    s.battle = null;
    s.phase = 'turn';
  }
  function finish(s, winner, reason) {
    s.phase = 'end';
    s.winner = winner;
    s.reason = reason;
    record(s, 'end', { winner, reason, remaining: { I: remaining(s, 'I'), R: remaining(s, 'R') },
      text: winner ? 'Ganan los ' + SIDE[winner].toLowerCase() + '.' : 'La partida termina en empate.' });
  }
  function nextTurn(s) {
    if (s.phase !== 'turn') return false;
    if (s.turn === 'R' && s.round === 12) {
      const margin = remaining(s, 'I') - remaining(s, 'R');
      finish(s, margin > 0 ? 'I' : margin < 0 ? 'R' : null, 'límite de rondas');
      return true;
    }
    if (s.turn === 'R') s.round++;
    s.turn = opponent(s.turn);
    s.players[s.turn].ownTurns++;
    s.actions = 0;
    s.attacked = false;
    s.moved = [];
    record(s, 'turn', { side: s.turn, text: 'Turno ' + (s.turn === 'I' ? 'idealista' : 'realista') + '.' });
    return true;
  }

  const game = { SIDE, CELLS, CARDS, ZONES, STARS, makeGame, adjacent, piece, occupant, remaining,
    moves, attacks, move, attack, actor, playable, reveal, rescue, summon, skipBonus, nextTurn,
    preparationChoices, prepare, canSummonInTurn, summonInTurn };
  if (typeof module === 'object') module.exports = game;
  else window.RealesIdeales = game;
})();
