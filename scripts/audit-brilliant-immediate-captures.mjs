import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { createKnightsEyePolicy } from '@knights-eye-chess/move-classifier/policy/knights-eye';

// Diagnostic only: audit all direct material-restoring captures for static
// offers that policy 46 currently marks as newly attacked. No engine scores.
const data = JSON.parse(readFileSync(new URL('../tests/fixtures/brilliant-corpus.json', import.meta.url)));
const fixtures = [...data.fixtures, ...data.interestingFixtures, ...data.addedFixtures, data.nc5SingleMoveFixture];
const policy = createKnightsEyePolicy(Chess);
const value = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
function material(fen, color) {
  return new Chess(fen).board().flat().filter(piece => piece?.color === color)
    .reduce((sum, piece) => sum + value[piece.type], 0);
}
function netLoss(baseline, next, mover) {
  const opponent = mover === 'w' ? 'b' : 'w';
  return material(baseline, mover) - material(next, mover) -
    (material(baseline, opponent) - material(next, opponent));
}
function staticExchangeResidual(board, square, baseline, mover, budget) {
  if (--budget.remaining < 0) throw new Error(`Static exchange budget exceeded on ${square}`);
  budget.used++;
  const moves = board.moves({ verbose: true });
  const recaptures = moves.filter(reply => /[ce]/.test(reply.flags) && reply.to === square);
  const stop = moves.length === 0 || moves.length > recaptures.length;
  const results = recaptures.map(reply => {
    board.move(reply.lan);
    const result = staticExchangeResidual(board, square, baseline, mover, budget);
    board.undo();
    return result;
  });
  if (stop) results.push(netLoss(baseline, board.fen(), mover));
  return board.turn() === mover ? Math.min(...results) : Math.max(...results);
}
const records = [];
let exchangeNodes = 0, maxExchangeNodes = 0;
for (const fixture of fixtures) {
  const game = new Chess(); game.loadPgn(fixture.pgn);
  const moves = game.history({ verbose: true }), replay = new Chess(game.header().FEN || undefined), fens = [replay.fen()];
  for (const move of moves) { replay.move(move.lan); fens.push(replay.fen()); }
  for (let index = 0; index < moves.length; index++) {
    const move = { ...moves[index], uci: moves[index].lan }, beforeFen = fens[index], afterFen = fens[index + 1];
    const context = { move, beforeFen, afterFen, priorOwnBeforeFen: index >= 2 ? fens[index - 2] : '',
      priorFen: index >= 1 ? fens[index - 1] : '',
      previousMove: index >= 1 ? { ...moves[index - 1], uci: moves[index - 1].lan } : null };
    for (const candidate of policy.offer(context, {}, '').candidates) {
      if (candidate.offerMode !== 'static' || !candidate.requiresSettledDeficit) continue;
      const accepted = new Chess(afterFen); accepted.move(candidate.uci);
      const acceptedFen = accepted.fen(), baseline = candidate.offerBaselineFen;
      const captures = accepted.moves({ verbose: true }).filter(reply => /[ce]/.test(reply.flags))
        .map(reply => {
          const board = new Chess(acceptedFen); board.move(reply.lan);
          const residual = netLoss(baseline, board.fen(), move.color);
          const budget = { remaining: 2000, used: 0 };
          const exchangeResidual = staticExchangeResidual(board, reply.to, baseline, move.color, budget);
          exchangeNodes += budget.used;
          maxExchangeNodes = Math.max(maxExchangeNodes, budget.used);
          const countercaptures = board.moves({ verbose: true })
            .filter(response => /[ce]/.test(response.flags) && response.to === reply.to)
            .map(response => {
              const counter = new Chess(board.fen()); counter.move(response.lan);
              return { uci: response.lan, san: response.san, residual: netLoss(baseline, counter.fen(), move.color) };
            }).sort((a, b) => b.residual - a.residual);
          return { uci: reply.lan, san: reply.san, residual, exchangeResidual,
            settledResidual: Math.max(residual, countercaptures[0]?.residual ?? -Infinity),
            worstSameSquareCounter: countercaptures[0] || null };
        }).sort((a, b) => a.residual - b.residual);
      const settled = [...captures].sort((a, b) => a.settledResidual - b.settledResidual)[0] || null;
      const exchange = [...captures].sort((a, b) => a.exchangeResidual - b.exchangeResidual)[0] || null;
      const auditedResidual = Math.min(netLoss(baseline, acceptedFen, move.color), exchange?.exchangeResidual ?? Infinity);
      assert.equal(candidate.settledRecoveryOverBudget, false);
      assert.ok(candidate.settledRecoveryNodes <= 256);
      assert.equal(candidate.settledRecoveryResidual, auditedResidual,
        `${fixture.name} ${index + 1}:${move.san} ${candidate.uci} settled residual`);
      records.push({ fixture: fixture.name, ply: index + 1, san: move.san, acceptance: candidate.uci,
        immediateLoss: netLoss(baseline, acceptedFen, move.color),
        sameSquareResidual: candidate.directRecoveryResidual, bestAnyCapture: captures[0] || null,
        bestOneReplySettledCapture: settled,
        bestStaticExchangeCapture: exchange,
        qualifiesWithStaticExchange: !exchange || exchange.exchangeResidual >= 120,
        qualifiesWithOneReply: !settled || settled.settledResidual >= 120,
        qualifiesWithAnyCapture: !captures.length || captures[0].residual >= 120 });
    }
  }
}
console.log(JSON.stringify({ count: records.length, removedNaive: records.filter(record => !record.qualifiesWithAnyCapture).length,
  removedOneReply: records.filter(record => !record.qualifiesWithOneReply).length,
  removedStaticExchange: records.filter(record => !record.qualifiesWithStaticExchange).length,
  exchangeNodes, maxExchangeNodes }));
for (const record of records) console.log(JSON.stringify(record));
