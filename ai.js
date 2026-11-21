(function () {
  'use strict';

  function decisionSide(game, rules) {
    switch (game.phase) {
      case 'turn': return game.turn;
      case 'reveal': return rules.actor(game);
      case 'bonus': return game.battle.winner;
      case 'rescue': return game.rescue.side;
      case 'summon': return game.summons[0];
      default: return null;
    }
  }

  function distance(rules, from, to) {
    const a = rules.CELLS[from];
    const b = rules.CELLS[to];
    const columns = Math.abs(a.col - b.col);
    return columns + Math.max(0, (Math.abs(a.row - b.row) - columns) / 2);
  }

  function movement(rules, game, allies, enemies, side) {
    const nearestEnemy = cell => Math.min(...enemies.map(enemy => distance(rules, cell, enemy.cell)));
    const canRescue = game.players[side].rescues > 0 && allies.length < 8
      && rules.ZONES[side].some(cell => !rules.occupant(game, cell));
    const towardsRescue = cell => Math.min(...rules.STARS[side].map(star => distance(rules, cell, star)));
    let best = null;
    let bestScore = -Infinity;
    for (const piece of allies) {
      for (const cell of rules.moves(game, piece.id)) {
        const progress = nearestEnemy(piece.cell) - nearestEnemy(cell);
        const advance = rules.CELLS[cell].row - rules.CELLS[piece.cell].row;
        const rescue = canRescue ? towardsRescue(piece.cell) - towardsRescue(cell) : 0;
        const score = 3 * progress - nearestEnemy(cell) + rescue + (side === 'R' ? -advance : advance) * .3
          + (canRescue && rules.STARS[side].includes(cell) ? 15 : 0) - (piece.cannon ? 8 : 0);
        if (score > bestScore) {
          best = { type: 'move', piece: piece.id, cell };
          bestScore = score;
        }
      }
    }
    return best;
  }

  function cardChoice(rules, game, side) {
    const battle = game.battle;
    const opponent = side === 'I' ? 'R' : 'I';
    const ownCards = battle.played[side];
    const seenCards = battle.played[opponent];
    const [ownBase, rivalBase] = side === battle.attacker ? [1, 0] : [0, 1];
    const bonus = (cards, key) => cards.reduce((sum, id) => sum + (rules.CARDS[id][key] ?? 0), 0);
    function outcome(cards) {
      const decisive = Number(cards.includes('decisive')) - Number(seenCards.includes('decisive'));
      const mine = Math.max(0, ownBase + bonus(cards, 'own') + bonus(seenCards, 'rival'));
      const theirs = Math.max(0, rivalBase + bonus(seenCards, 'own') + bonus(cards, 'rival'));
      return decisive || Math.sign(mine - theirs);
    }
    const costs = { boost: 1, weaken: 1, major: 2, decisive: 4 };
    const current = outcome(ownCards);
    let best = { type: 'reveal', index: null };
    let bestScore = current * 6;
    for (const [index, card] of game.players[side].hand.entries()) {
      if (!rules.playable(game, side, card)) continue;
      const score = outcome([...ownCards, card]) * 6 + (card === 'cannon' ? 3 : -costs[card]);
      if (score > bestScore) {
        best = { type: 'reveal', index };
        bestScore = score;
      }
    }
    return best;
  }

  function choose(rules, game, side) {
    if (decisionSide(game, rules) !== side) return null;
    if (game.phase === 'reveal') return cardChoice(rules, game, side);
    const allies = game.pieces.filter(piece => piece.side === side && piece.cell);
    const enemies = game.pieces.filter(piece => piece.side !== side && piece.cell);
    if (game.phase === 'summon') {
      const distanceFromFront = piece => Math.min(...enemies.map(enemy => distance(rules, piece.cell, enemy.cell)));
      const safest = allies.reduce((best, piece) => distanceFromFront(piece) > distanceFromFront(best) ? piece : best);
      return { type: 'summon', piece: safest.id };
    }
    if (game.phase === 'rescue') {
      const captured = game.pieces.find(piece => piece.side === side && !piece.cell);
      const cell = rules.ZONES[side].find(id => !rules.occupant(game, id));
      return { type: 'rescue', piece: captured?.id ?? null, cell };
    }
    if (game.phase === 'turn') {
      const attacks = allies.flatMap(piece => rules.attacks(game, piece.id)
        .map(target => ({ type: 'attack', piece: piece.id, target })));
      if (attacks.length) return attacks.find(attack => rules.piece(game, attack.target).cannon) ?? attacks[0];
    }
    return movement(rules, game, allies, enemies, side)
      ?? { type: game.phase === 'bonus' ? 'skipBonus' : 'nextTurn' };
  }

  const ai = { choose, decisionSide };
  if (typeof module === 'object') module.exports = ai;
  else window.RealesIdealesAI = ai;
})();
