(function () {
  'use strict';

  function decisionSide(game, rules) {
    switch (game.phase) {
      case 'turn': return game.turn;
      case 'reveal': return rules.actor(game);
      case 'bonus': return game.battle.winner;
      case 'rescue': return game.rescue.side;
      case 'combo': return game.battle.combo.side;
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
    // Usa el mismo cálculo de fuerza que el motor (base 0, cañón y ataque especial).
    function outcome(cards) {
      const force = rules.projected(game, { [side]: cards, [opponent]: seenCards });
      const attacking = side === battle.attacker;
      const margin = force.decisive || force.attacker - force.defender;
      return Math.sign(attacking ? margin : -margin);
    }
    const costs = { boost: 1, weaken: 1, major: 2, decisive: 3, cannon: 1, search: 0 };
    const current = outcome(ownCards);
    let best = { type: 'reveal', index: null };
    let bestScore = current * 6;
    for (const [index, card] of game.players[side].hand.entries()) {
      if (!rules.playable(game, side, card)) continue;
      const options = card === 'search' ? rules.searchOptions(game, side) : [];
      const preference = { decisive: 6, major: 5, cannon: 4, boost: 3, search: 2, weaken: 1 };
      const searchTarget = options.sort((a, b) => preference[b] - preference[a])[0] ?? null;
      const score = outcome([...ownCards, card]) * 6
        + (card === 'cannon' ? 2 : card === 'search' ? 1 : -costs[card]);
      if (score > bestScore) {
        best = { type: 'reveal', index, searchTarget };
        bestScore = score;
      }
    }
    return best;
  }

  // Elige el mejor ataque especial disponible: más fuerza, objetivos valiosos y efectos extra.
  function specialChoice(rules, game, allies, side) {
    if (game.players[side].charge < rules.CHARGE_MAX) return null;
    const rival = side === 'I' ? 'R' : 'I';
    const rivalCards = game.players[rival].hand.filter(Boolean).length;
    let best = null;
    let bestScore = -Infinity;
    for (const piece of allies) {
      const power = rules.SPECIALS[piece.animal];
      for (const option of rules.specialOptions(game, piece.id)) {
        const target = rules.piece(game, option.target);
        let score = power.bonus + (target.cannon ? 3 : 0);
        if (power.rivalLimit !== undefined) score += Math.min(rivalCards, 2 - power.rivalLimit) * 1.2;
        if (power.double) score += 1.5;
        if (option.at !== piece.cell) score -= .2;
        if (score > bestScore) {
          best = { type: 'special', piece: piece.id, target: option.target, at: option.at };
          bestScore = score;
        }
      }
    }
    return best;
  }

  function choose(rules, game, side) {
    if (decisionSide(game, rules) !== side) return null;
    if (game.phase === 'reveal') return cardChoice(rules, game, side);
    const allies = game.pieces.filter(piece => piece.side === side && piece.cell);
    const enemies = game.pieces.filter(piece => piece.side !== side && piece.cell);
    if (game.phase === 'combo') {
      const targets = rules.comboTargets(game).map(id => rules.piece(game, id));
      const priority = p => (p.cannon ? 10 : 0);
      targets.sort((a, b) => priority(b) - priority(a));
      return { type: 'combo', target: targets[0]?.id ?? null };
    }
    if (game.phase === 'rescue') {
      const captured = game.pieces.find(piece => piece.side === side && !piece.cell);
      const cell = rules.ZONES[side].find(id => !rules.occupant(game, id));
      return { type: 'rescue', piece: captured?.id ?? null, cell };
    }
    if (game.phase === 'turn') {
      const special = specialChoice(rules, game, allies, side);
      if (special) return special;
      // Con fuerza base 0, atacar sin cartas útiles suele acabar en empate y doble baja.
      const hand = game.players[side].hand.filter(Boolean);
      const useful = hand.some(card => (rules.CARDS[card].own ?? 0) > 0 || card === 'decisive');
      const attacks = allies.flatMap(piece => rules.attacks(game, piece.id)
        .map(target => ({ type: 'attack', piece: piece.id, target })));
      const cannonTarget = attacks.find(attack => rules.piece(game, attack.target).cannon);
      const armed = attacks.find(attack => rules.piece(game, attack.piece).cannon);
      if (attacks.length && (useful || cannonTarget || armed)) return armed ?? cannonTarget ?? attacks[0];
    }
    return movement(rules, game, allies, enemies, side)
      ?? { type: game.phase === 'bonus' ? 'skipBonus' : 'nextTurn' };
  }

  const ai = { choose, decisionSide };
  if (typeof module === 'object') module.exports = ai;
  else window.RealesIdealesAI = ai;
})();
