(function () {
  'use strict';

  const SIDE = { I: 'Idealistas', R: 'Realistas' };
  const HAND_SIZE = 3;
  // Todas las fichas tienen fuerza base 0 y comparten el Fuego Especial.
  const ROSTER = {
    I: ['mono', 'llama', 'guacamayo', 'rana', 'tigrillo', 'gallo', 'cuy', 'gato'],
    R: ['rana', 'tigrillo', 'guacamayo', 'gallo', 'cuy', 'llama', 'mono', 'gato'],
  };
  // Barra por bando: +1 al empezar cada turno propio; con 3 se puede lanzar un ataque especial.
  const CHARGE_MAX = 3;
  // La especie solo identifica el arte y las animaciones; la regla es universal.
  const FIRE_POWER = Object.freeze({ name: 'Fuego Especial', bonus: 3, reach: 2, description: '+3 de fuerza; a dos casillas, consume también el movimiento para acercarse.' });
  const SPECIALS = Object.freeze(Object.fromEntries(ROSTER.I.map(animal => [animal, FIRE_POWER])));
  const CARDS = {
    boost: { name: 'Refuerzo', count: 8, own: 1, description: 'Suma 1 a tu fuerza.' },
    weaken: { name: 'Debilitar', count: 8, rival: -1, description: 'Resta 1 a la fuerza rival.' },
    major: { powerful: true, name: 'Refuerzo mayor', count: 4, own: 2, description: 'Suma 2 a tu fuerza.' },
    decisive: { powerful: true, name: 'Golpe decisivo', count: 2, description: 'Gana. Si ambos lo juegan, se anulan.' },
    cannon: { powerful: true, name: 'Invocar cañón', count: 2, own: 2, description: 'Tu ficha en combate se convierte en cañón al instante y suma +2.' },
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
  const cellAt = (col, row) => {
    const id = 'ABCDE'[col] + row;
    return col >= 0 && col < 5 && CELLS[id] ? id : null;
  };
  // Distancia en hexágonos (columnas contiguas avanzan una fila; la misma columna, dos).
  function distance(a, b) {
    const x = CELLS[a], y = CELLS[b];
    const cols = Math.abs(x.col - y.col);
    return cols + Math.max(0, (Math.abs(x.row - y.row) - cols) / 2);
  }
  const DIRECTIONS = [[0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]];
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
    const player = { deck: deck.slice(), hand: [], discard: [], removed: [], rescues: 2, savedRescues: [], coins: 0, ownTurns: 0, charge: 0 };
    draw(player);
    return player;
  }
  function makeGame(decks = {}) {
    const deck = () => shuffle(Object.entries(CARDS).flatMap(([id, card]) => Array(card.count).fill(id)));
    const state = {
      players: { I: makePlayer(decks.I ?? deck()), R: makePlayer(decks.R ?? deck()) },
      pieces: Object.entries(ZONES).flatMap(([side, cells]) =>
        cells.map((cell, i) => ({ id: side + (i + 1), side, animal: ROSTER[side][i], cell, cannon: false, ready: 0 }))),
      turn: 'I', round: 1, actions: 0, attacked: false, moved: [],
      phase: 'turn', battle: null, rescue: null, winner: null, reason: null, events: [],
    };
    state.players.I.ownTurns = 1;
    state.players.I.charge = 1;
    record(state, 'turn', { side: 'I', text: 'Turno idealista.' });
    return state;
  }
  function record(s, type, fields) {
    s.events.push({ type, round: s.round, turn: s.turn, ...fields });
  }
  const COIN_REWARDS = Object.freeze({ powerful: 10, defeat: 20 });
  function awardCoins(s, fighter, reason) {
    const amount = COIN_REWARDS[reason];
    s.players[fighter.side].coins += amount;
    record(s, 'reward', { side: fighter.side, piece: fighter.id, cell: fighter.cell, amount, reason,
      text: SIDE[fighter.side] + ' reciben ' + amount + ' monedas.' });
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
  // Estado de las dos acciones normales: útil para el HUD y el cierre automático.
  function turnActions(s) {
    if (s.phase !== 'turn') return { move: 'waiting', attack: 'waiting' };
    const allies = s.pieces.filter(p => p.side === s.turn && p.cell);
    return {
      move: s.moved.length ? 'spent' : allies.some(p => moves(s, p.id).length) ? 'ready' : 'waiting',
      attack: s.attacked ? 'spent' : allies.some(p => attacks(s, p.id).length || specialOptions(s, p.id).length) ? 'ready' : 'waiting',
    };
  }
  function entry(s, p, cell, after, type) {
    const from = p.cell;
    p.cell = cell;
    record(s, type, { side: p.side, piece: p.id, from, to: cell, text: p.id + ' avanza de ' + from + ' a ' + cell + '.' });
    if (STARS[p.side].includes(cell) && s.players[p.side].rescues &&
        s.pieces.some(q => q.side === p.side && !q.cell) && ZONES[p.side].some(c => !occupant(s, c))) {
      s.phase = 'rescue';
      s.rescue = { side: p.side, after, source: 'star' };
    } else continueAfterEntry(s, after);
  }
  function continueAfterEntry(s, after) {
    if (after === 'battle') replenish(s);
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
  // Una llegada concede un marcador; guardarlo reserva el derecho para otro turno.
  function availableSavedRescues(s, side) {
    return s.players[side].savedRescues.filter(availableAt => availableAt <= s.players[side].ownTurns).length;
  }
  function canUseSavedRescue(s, side = s.turn) {
    return s.phase === 'turn' && s.turn === side && availableSavedRescues(s, side) > 0 &&
      s.pieces.some(p => p.side === side && !p.cell) &&
      Object.keys(CELLS).some(cell => !occupant(s, cell));
  }
  function startSavedRescue(s) {
    if (!canUseSavedRescue(s)) return false;
    s.rescue = { side: s.turn, after: 'turn', source: 'saved' };
    s.phase = 'rescue';
    return true;
  }
  function rescueTargets(s) {
    if (s.phase !== 'rescue' || !s.rescue) return [];
    const { side, source } = s.rescue;
    return (source === 'saved' ? Object.keys(CELLS) : ZONES[side]).filter(cell => !occupant(s, cell));
  }
  function rescue(s, id, cell) {
    if (s.phase !== 'rescue') return false;
    const { side, after, source } = s.rescue;
    const player = s.players[side];
    const savedIndex = player.savedRescues.findIndex(t => t <= player.ownTurns);
    if (source === 'saved' ? savedIndex < 0 || s.turn !== side : player.rescues <= 0) return false;
    if (id !== null) {
      const p = piece(s, id);
      if (!p || p.cell || p.side !== side || !rescueTargets(s).includes(cell)) return false;
      p.cell = cell;
      p.cannon = false;
      p.ready = 0;
      if (source === 'saved') player.savedRescues.splice(savedIndex, 1);
      else player.rescues--;
      record(s, 'rescue', { side, piece: id, to: cell, source, text: SIDE[side] + ' rescatan a ' + id + ' en ' + cell + '.' });
    } else if (source !== 'saved') {
      player.rescues--;
      player.savedRescues.push(player.ownTurns + 1);
      record(s, 'rescue-saved', { side, text: SIDE[side] + ' guardan una estrella de rescate.' });
    }
    s.rescue = null;
    continueAfterEntry(s, after);
    return true;
  }
  function attack(s, id, target) {
    if (!attacks(s, id).includes(target)) return false;
    startBattle(s, piece(s, id), piece(s, target), null);
    return true;
  }
  function startBattle(s, a, d, special) {
    s.actions++;
    s.attacked = true;
    s.battle = { a: a.id, d: d.id, attacker: a.side, defender: d.side, nearby: adjacent(a.cell, d.cell),
      attackerCannon: a.cannon, special, slot: 0, played: { I: [], R: [] }, search: { I: [], R: [] }, startedWithCannon: {
        I: s.pieces.some(p => p.side === 'I' && p.cell && p.cannon),
        R: s.pieces.some(p => p.side === 'R' && p.cell && p.cannon),
      } };
    s.phase = 'reveal';
    record(s, 'attack', { side: a.side, piece: a.id, target: d.id, nearby: s.battle.nearby, special,
      text: a.id + ' ataca a ' + d.id + '.' });
  }
  // Fuego Especial: combate adyacente o un paso legal de aproximación.
  function specialOptions(s, id) {
    const p = piece(s, id);
    if (s.phase !== 'turn' || !p?.cell || p.side !== s.turn || s.attacked || s.actions >= 2 ||
        p.cannon || s.players[p.side].charge < CHARGE_MAX) return [];
    const enemies = s.pieces.filter(q => q.cell && q.side !== p.side);
    const options = attacks(s, id).map(target => ({ target, at: p.cell }));
    for (const at of moves(s, id)) for (const q of enemies) {
      if (distance(p.cell, q.cell) === 2 && adjacent(at, q.cell)) options.push({ target: q.id, at });
    }
    return options;
  }
  function specialAttack(s, id, target, at = null) {
    const p = piece(s, id);
    const options = specialOptions(s, id).filter(o => o.target === target);
    const option = at === null ? options[0] : options.find(o => o.at === at);
    if (!option) return false;
    s.players[p.side].charge = 0;
    if (option.at !== p.cell) {
      const from = p.cell;
      p.cell = option.at;
      s.actions++;
      s.moved.push(id);
      // Aproximación integrada al ataque: no abre un rescate intermedio.
      record(s, 'leap', { side: p.side, piece: id, from, to: p.cell, animal: p.animal,
        text: id + ' se acerca a ' + p.cell + ' con el Fuego Especial.' });
    }
    record(s, 'special', { side: p.side, piece: id, animal: p.animal, power: FIRE_POWER.name, target,
      text: id + ' lanza ' + FIRE_POWER.name + '.' });
    startBattle(s, p, piece(s, target), p.animal);
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
  // Ambos bandos conservan sus dos oportunidades de activar cartas.
  function cardLimit(s, side) { return 2; }
  function playable(s, side, card) {
    if (s.phase !== 'reveal' || !card || s.battle.played[side].length >= cardLimit(s, side)) return false;
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
      if (card === 'cannon') {
        // La ficha que combate se convierte en cañón en el acto.
        const fighter = piece(s, side === s.battle.attacker ? s.battle.a : s.battle.d);
        fighter.cannon = true;
        fighter.ready = s.players[side].ownTurns + 1;
        record(s, 'summon', { side, piece: fighter.id, cell: fighter.cell, text: fighter.id + ' se convierte en cañón.' });
      }
      const cards = s.battle.played[side];
      if (cards.length === 2 && cards[0] === cards[1])
        record(s, 'combo-card', { side, card, text: '¡COMBO! ' + SIDE[side] + ' reciben +1 de fuerza.' });
    } else record(s, 'pass', { side, text: SIDE[side] + ' pasan.' });
    s.battle.slot++;
    if (s.battle.slot === 4) resolveBattle(s);
    return true;
  }
  const comboBonus = cards => cards.length === 2 && cards[0] === cards[1] ? 1 : 0;
  // Fuerza inicial del atacante: 0, +2 si ya era cañón y el bono de su ataque especial.
  function baseAttack(s) {
    const b = s.battle;
    return (b.attackerCannon ? 2 : 0) + (b.special ? FIRE_POWER.bonus : 0);
  }
  // Fuerza de ambos bandos con un conjunto de cartas (por defecto, las activadas).
  function projected(s, played = s.battle.played) {
    const b = s.battle;
    const ac = played[b.attacker], dc = played[b.defender];
    return {
      attacker: strength(ac, dc, baseAttack(s) + comboBonus(ac)),
      defender: strength(dc, ac, comboBonus(dc)),
      decisive: ac.filter(c => c === 'decisive').length - dc.filter(c => c === 'decisive').length,
    };
  }
  function strength(own, rival, base) {
    return Math.max(0, own.reduce((sum, id) => sum + (CARDS[id].own ?? 0), base)
      + rival.reduce((sum, id) => sum + (CARDS[id].rival ?? 0), 0));
  }
  function continueBattle(s, winner, cleared, nearby) {
    if (winner && nearby) entry(s, winner, cleared, 'battle', 'advance');
    else if (winner) s.phase = 'bonus';
    else replenish(s);
  }
  function resolveBattle(s) {
    const b = s.battle;
    const a = piece(s, b.a), d = piece(s, b.d);
    // Dos golpes decisivos superan a uno; uno por cada bando se anula.
    const { attacker: af, defender: df, decisive } = projected(s);
    const difference = decisive || af - df;
    const winner = difference > 0 ? a : difference < 0 ? d : null;
    const loser = winner === a ? d : a;
    const cleared = loser.cell;
    const removed = winner ? [loser] : [a, d];
    // Guarda las posiciones originales para que los premios se animen sobre las fichas.
    const attackers = [{ ...a }, { ...d }];
    for (const p of removed) {
      p.cell = null;
      p.cannon = false;
      p.ready = 0;
    }
    b.winner = winner?.side ?? null;
    const decisiveCombo = Boolean(winner && b.played[winner.side].filter(card => card === 'decisive').length === 2);
    const decisiveWin = Boolean(decisive && winner && !b.played[loser.side].includes('decisive'));
    record(s, 'battle', { attacker: a.side, defender: d.side, nearby: b.nearby, advantage: decisive,
      decisiveWin, force: [af, df], combos: { I: comboBonus(b.played.I), R: comboBonus(b.played.R) },
      decisiveCombo, winner: b.winner, removed: removed.map(p => p.id),
      text: winner ? 'Vence ' + winner.id + '. Sale ' + loser.id + '.' : 'Empate. Salen ' + a.id + ' y ' + d.id + '.' });
    for (const [index, fighter] of attackers.entries()) {
      const force = index === 0 ? af : df;
      if (force >= 3 || (index === 0 && b.special) || b.played[fighter.side].includes('decisive'))
        awardCoins(s, fighter, 'powerful');
    }
    if (winner) awardCoins(s, winner, 'defeat');
    if (!remaining(s, 'I') || !remaining(s, 'R')) {
      finish(s, remaining(s, 'I') ? 'I' : remaining(s, 'R') ? 'R' : null, 'eliminación');
      return;
    }
    if (decisiveCombo) {
      b.combo = { kind: 'decisive', side: winner.side, winner: winner.id, cleared, nearby: b.nearby };
      s.phase = 'combo';
      record(s, 'combo-ready', { side: winner.side, text: '¡COMBO DECISIVO! Elige una segunda ficha enemiga para eliminar.' });
      return;
    }
    continueBattle(s, winner, cleared, b.nearby);
  }
  function comboTargets(s) {
    if (s.phase !== 'combo') return [];
    const { side, kind, winner } = s.battle.combo;
    const from = piece(s, winner).cell;
    return s.pieces.filter(p => p.side !== side && p.cell && (kind !== 'double' || adjacent(p.cell, from))).map(p => p.id);
  }
  function comboEliminate(s, targetId) {
    if (s.phase !== 'combo') return false;
    const options = comboTargets(s);
    if (targetId !== null && !options.includes(targetId)) return false;
    const { winner: winnerId, cleared, nearby, side, kind } = s.battle.combo;
    if (targetId !== null) {
      const victim = piece(s, targetId);
      victim.cell = null;
      victim.cannon = false;
      victim.ready = 0;
      record(s, kind === 'double' ? 'double' : 'combo', { side, target: targetId, text: (kind === 'double'
        ? '¡DOBLE IMPACTO! ' : '¡COMBO DECISIVO! ') + targetId + ' es eliminada como segunda ficha.' });
      awardCoins(s, piece(s, winnerId), 'defeat');
    } else record(s, 'combo-skip', { side, text: SIDE[side] + ' omiten la segunda eliminación.' });
    s.battle.combo = null;
    if (!remaining(s, 'I') || !remaining(s, 'R')) {
      finish(s, remaining(s, 'I') ? 'I' : remaining(s, 'R') ? 'R' : null, 'eliminación');
    } else continueBattle(s, piece(s, winnerId), cleared, nearby);
    return true;
  }
  function skipBonus(s) {
    if (s.phase !== 'bonus') return false;
    replenish(s);
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
  function finishOnTime(s) {
    if (s.phase === 'end') return false;
    const scores = Object.fromEntries(['I', 'R'].map(side => [side, {
      pieces: remaining(s, side), cards: 0, powerful: 0,
    }]));
    for (const event of s.events) {
      if (event.type !== 'reveal') continue;
      scores[event.side].cards++;
      if (CARDS[event.card].powerful) scores[event.side].powerful++;
    }
    const criterion = ['pieces', 'cards', 'powerful'].find(key => scores.I[key] !== scores.R[key]);
    const winner = criterion ? (scores.I[criterion] > scores.R[criterion] ? 'I' : 'R') : null;
    s.timeResult = { scores, criterion };
    record(s, 'time-cannon', { text: 'El cañón anuncia el fin del juego.' });
    finish(s, winner, 'límite de tiempo');
    return true;
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
    s.players[s.turn].charge = Math.min(CHARGE_MAX, s.players[s.turn].charge + 1);
    s.actions = 0;
    s.attacked = false;
    s.moved = [];
    record(s, 'turn', { side: s.turn, text: 'Turno ' + (s.turn === 'I' ? 'idealista' : 'realista') + '.' });
    return true;
  }

  const game = { SIDE, HAND_SIZE, ROSTER, FIRE_POWER, SPECIALS, CHARGE_MAX, COIN_REWARDS, CELLS, CARDS, ZONES, STARS, makeGame, adjacent, distance,
    piece, occupant, remaining, moves, attacks, turnActions, move, attack, specialOptions, specialAttack, actor, cardLimit, playable,
    searchOptions, reveal, projected, comboTargets, comboEliminate, rescue, rescueTargets, availableSavedRescues, canUseSavedRescue, startSavedRescue, skipBonus, nextTurn, finishOnTime };
  if (typeof module === 'object') module.exports = game;
  else window.RealesIdeales = game;
})();
