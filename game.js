(function () {
  'use strict';

  const SIDE = { I: 'Idealistas', R: 'Realistas' };
  const HAND_SIZE = 3;
  // Fichas originalmente situadas en la punta central; la ventaja viaja con ellas.
  const VANGUARD = { I: 'I5', R: 'R4' };
  const CARDS = {
    boost: { name: 'Refuerzo', count: 8, own: 1, description: 'Suma 1 a tu fuerza.' },
    weaken: { name: 'Debilitar', count: 8, rival: -1, description: 'Resta 1 a la fuerza rival.' },
    major: { name: 'Refuerzo mayor', count: 4, own: 2, description: 'Suma 2 a tu fuerza.' },
    decisive: { name: 'Golpe decisivo', count: 2, description: 'Gana. Si ambos lo juegan, se anulan.' },
    cannon: { name: 'Invocar cañón', count: 2, own: 1, description: '+1 durante el combate. Después, transforma una ficha propia en cañón.' },
    search: { name: 'Exploración', count: 4, own: 1, description: '+1 y busca una carta de tu mazo que sustituye a Exploración al acabar el combate.' },
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
    let drawn = 0;
    for (let slot = 0; slot < HAND_SIZE; slot++) {
      if (player.hand[slot]) continue;
      if (!player.deck.length) player.deck = shuffle(player.discard.splice(0));
      if (!player.deck.length) continue;
      player.hand[slot] = player.deck.pop();
      drawn++;
    }
    return drawn;
  }
  function makePlayer(deck) {
    const player = { deck: deck.slice(), hand: [], discard: [], removed: [], rescues: 2, ownTurns: 0 };
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
  function moves(s, id) {
    const p = piece(s, id);
    const allowed = p?.cell && (s.phase === 'bonus' ? s.battle.winner === p.side
      : s.phase === 'turn' && p.side === s.turn && s.actions < 2 && s.moved.length === 0);
    return allowed ? Object.keys(CELLS).filter(cell => adjacent(p.cell, cell) && !occupant(s, cell)) : [];
  }
  function attacks(s, id) {
    const p = piece(s, id);
    if (s.phase !== 'turn' || !p?.cell || p.side !== s.turn || s.actions >= 2 || s.attacked) return [];
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
      slot: 0, played: { I: [], R: [] }, search: { I: [], R: [] }, startedWithCannon: {
        I: s.pieces.some(p => p.side === 'I' && p.cell && p.cannon),
        R: s.pieces.some(p => p.side === 'R' && p.cell && p.cannon),
      } };
    s.phase = 'reveal';
    record(s, 'attack', { side: a.side, piece: id, target, nearby: s.battle.nearby, text: id + ' ataca a ' + target + '.' });
    return true;
  }
  const actor = s => s.battle.slot % 2 ? s.battle.attacker : s.battle.defender;
  function searchOptions(s, side) {
    const reserved = s.battle?.search[side].map(item => item.card) ?? [];
    const remaining = s.players[side].deck.slice();
    for (const card of reserved) {
      const at = remaining.indexOf(card);
      if (at !== -1) remaining.splice(at, 1);
    }
    return Object.keys(CARDS).filter(card => remaining.includes(card));
  }
  function playable(s, side, card) {
    if (s.phase !== 'reveal' || !card || s.battle.played[side].length >= 2) return false;
    return card !== 'cannon' || (!s.battle.startedWithCannon[side] && !s.battle.played[side].includes(card));
  }
  // El índice se mantiene como ranura estable (0, 1 o 2) durante el combate.
  // La carta elegida por Exploración no entra en la reserva hasta la reposición final.
  function reveal(s, index, searchedCard = null) {
    if (s.phase !== 'reveal') return false;
    const side = actor(s);
    if (index !== null) {
      const player = s.players[side];
      const card = player.hand[index];
      if (!playable(s, side, card)) return false;
      if (card === 'search') {
        const options = searchOptions(s, side);
        if (options.length && !options.includes(searchedCard)) return false;
        if (!options.length && searchedCard !== null) return false;
      }
      player.hand[index] = null;
      s.battle.played[side].push(card);
      if (card === 'search' && searchedCard) s.battle.search[side].push({ slot: index, card: searchedCard });
      record(s, 'reveal', { side, card, text: SIDE[side] + ' activan ' + CARDS[card].name + '.' });
      const cards = s.battle.played[side];
      if (cards.length === 2 && cards[0] === cards[1])
        record(s, 'combo-card', { side, card, text: '¡COMBO! ' + SIDE[side] + ' reciben +1 de fuerza.' });
    } else record(s, 'pass', { side, text: SIDE[side] + ' pasan.' });
    s.battle.slot++;
    if (s.battle.slot === 4) resolveBattle(s);
    return true;
  }
  const comboBonus = cards => cards.length === 2 && cards[0] === cards[1] ? 1 : 0;
  function baseAttack(s, p) {
    return 1 + (p.cannon ? 2 : VANGUARD[p.side] === p.id ? 2 : 0);
  }
  function strength(own, rival, base) {
    return Math.max(0, own.reduce((sum, id) => sum + (CARDS[id].own ?? 0), base)
      + rival.reduce((sum, id) => sum + (CARDS[id].rival ?? 0), 0));
  }
  function continueBattle(s, winner, cleared, nearby) {
    if (winner && nearby) entry(s, winner, cleared, 'battle', 'advance');
    else if (winner) s.phase = 'bonus';
    else startSummons(s);
  }
  function resolveBattle(s) {
    const b = s.battle;
    const a = piece(s, b.a), d = piece(s, b.d);
    const ac = b.played[a.side], dc = b.played[d.side];
    const af = strength(ac, dc, baseAttack(s, a) + comboBonus(ac));
    const df = strength(dc, ac, comboBonus(dc));
    // Dos golpes decisivos superan a uno; uno por cada bando se anula.
    const decisive = ac.filter(c => c === 'decisive').length - dc.filter(c => c === 'decisive').length;
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
    const decisiveCombo = Boolean(winner && b.played[winner.side].filter(card => card === 'decisive').length === 2);
    record(s, 'battle', { attacker: a.side, defender: d.side, nearby: b.nearby, advantage: decisive,
      force: [af, df], combos: { I: comboBonus(b.played.I), R: comboBonus(b.played.R) },
      decisiveCombo, winner: b.winner, removed: removed.map(p => p.id),
      text: winner ? 'Vence ' + winner.id + '. Sale ' + loser.id + '.' : 'Empate. Salen ' + a.id + ' y ' + d.id + '.' });
    if (!remaining(s, 'I') || !remaining(s, 'R')) {
      finish(s, remaining(s, 'I') ? 'I' : remaining(s, 'R') ? 'R' : null, 'eliminación');
      return;
    }
    if (decisiveCombo) {
      b.combo = { side: winner.side, winner: winner.id, cleared, nearby: b.nearby };
      s.phase = 'combo';
      record(s, 'combo-ready', { side: winner.side, text: '¡COMBO DECISIVO! Elige una segunda ficha enemiga para eliminar.' });
      return;
    }
    continueBattle(s, winner, cleared, b.nearby);
  }
  function comboTargets(s) {
    if (s.phase !== 'combo') return [];
    return s.pieces.filter(p => p.side !== s.battle.combo.side && p.cell).map(p => p.id);
  }
  function comboEliminate(s, targetId) {
    if (s.phase !== 'combo') return false;
    const options = comboTargets(s);
    if (targetId !== null && !options.includes(targetId)) return false;
    const { winner: winnerId, cleared, nearby, side } = s.battle.combo;
    if (targetId !== null) {
      const victim = piece(s, targetId);
      victim.cell = null;
      victim.cannon = false;
      victim.ready = 0;
      record(s, 'combo', { side, target: targetId, text: '¡COMBO DECISIVO! ' + targetId + ' es eliminada como segunda ficha.' });
    } else record(s, 'combo-skip', { side, text: SIDE[side] + ' omiten la segunda eliminación.' });
    s.battle.combo = null;
    if (!remaining(s, 'I') || !remaining(s, 'R')) {
      finish(s, remaining(s, 'I') ? 'I' : remaining(s, 'R') ? 'R' : null, 'eliminación');
    } else continueBattle(s, piece(s, winnerId), cleared, nearby);
    return true;
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
    p.cannon = true;
    p.ready = s.players[side].ownTurns + 1;
    s.summons.shift();
    record(s, 'summon', { side, piece: id, cell: p.cell, text: p.id + ' se convierte en cañón.' });
    if (!s.summons.length) replenish(s);
    return true;
  }
  function replenish(s) {
    for (const side of ['I', 'R']) {
      const player = s.players[side];
      for (const card of s.battle.played[side]) {
        (card === 'cannon' ? player.removed : player.discard).push(card);
      }
      for (const { slot, card } of s.battle.search[side]) {
        const index = player.deck.indexOf(card);
        if (index === -1) continue; // El resultado del mazo nunca se inventa.
        player.deck.splice(index, 1);
        player.hand[slot] = card;
        record(s, 'search', { side, text: SIDE[side] + ' colocan una carta buscada en su reserva.' });
      }
      const count = draw(player);
      if (count) record(s, 'draw', { side, count, text: SIDE[side] + ' roban ' + count + ' carta' + (count === 1 ? '' : 's') + '.' });
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

  const game = { SIDE, HAND_SIZE, VANGUARD, CELLS, CARDS, ZONES, STARS, makeGame, adjacent, piece, occupant, remaining,
    moves, attacks, move, attack, actor, playable, searchOptions, reveal, comboTargets, comboEliminate,
    rescue, summon, skipBonus, nextTurn };
  if (typeof module === 'object') module.exports = game;
  else window.RealesIdeales = game;
})();
