import assert from 'node:assert/strict';
import test from 'node:test';
import { Chess } from 'chess.js';
import { createChessAnalyzerCore } from '@knights-eye-chess/move-classifier/core';
import { createStockfishAdapter } from '@knights-eye-chess/move-classifier/engine/stockfish';
const startFen = new Chess().fen();
function fakeEngine() {
  const requests = [];
  return { requests, async search(request) {
    requests.push(request);
    const candidates = new Chess(request.fen).moves({ verbose: true }).slice(0, request.multiPv).map((move, i) => ({ multipv: i + 1, depth: request.depth, scoreCp: 20 - i * 10, mate: null, pv: [move.from + move.to + (move.promotion || '')] }));
    return { ...candidates[0], bestmove: candidates[0].pv[0], candidates };
  } };
}
function policy() {
  return { identity: { id: 'example/test', revision: 1 }, verificationSatisfies: () => true, terminal: () => null, legalCount: fen => new Chess(fen).moves().length, materialExchangeForMove: () => null, exchange: () => ({ inherited: false, originFen: '' }), offer: () => ({ candidates: [], verification: null }), verify: () => null, classify: context => ({ classification: context.book ? 'In my book' : 'My custom label' }), priorPoints: () => 0 };
}
test('external consumer supplies chess, policy and engine; exact history and cache work', async () => {
  const engine = fakeEngine(), core = createChessAnalyzerCore(Chess, engine, policy());
  const request = { startFen, history: ['e2e4', 'e7e5'], depth: 4 };
  const result = await core.analyzeAndClassify(request);
  assert.equal(result.decision.classification, 'My custom label');
  assert.equal(result.context.move.san, 'e5');
  assert.equal(engine.requests.length, 3);
  await core.analyzeAndClassify(request); assert.equal(engine.requests.length, 3);
  core.clearEvidence(); await core.analyzeAndClassify(request); assert.equal(engine.requests.length, 6);
});
test('injected opening lookup is optional, explicit book wins, custom roots can consult it', async () => {
  let calls = 0;
  const core = createChessAnalyzerCore(Chess, fakeEngine(), policy(), { openingLookup() { calls++; return { eco: 'test', name: 'Host opening' }; } });
  assert.equal((await core.analyzeAndClassify({ startFen, history: ['e2e4'], depth: 4 })).decision.classification, 'In my book');
  assert.equal((await core.analyzeAndClassify({ startFen, history: ['e2e4'], depth: 4, book: false })).decision.classification, 'My custom label');
  const chess = new Chess(); chess.move('e4');
  assert.equal((await core.analyzeAndClassify({ startFen: chess.fen(), history: ['c7c5'], depth: 4 })).context.book, true);
  assert.equal(calls, 2);
});
test('illegal/empty history and cancellation fail before engine acquisition', async () => {
  const engine = fakeEngine(), core = createChessAnalyzerCore(Chess, engine, policy()), controller = new AbortController(); controller.abort();
  for (const history of [[], ['e2e5'], ['not-uci']]) assert.equal((await core.analyzeAndClassify({ startFen, history, depth: 4 })).status, 'unavailable');
  assert.equal((await core.analyzeAndClassify({ startFen, history: ['e2e4'], depth: 4, signal: controller.signal })).reason, 'cancelled');
  assert.equal(engine.requests.length, 0);
});
test('host owns UCI lifecycle; search roots/depth/abort pass through the adapter', async () => {
  const commands = []; let receive, terminated = 0;
  const engine = createStockfishAdapter((_label, listener) => { receive = listener; return { postMessage: command => commands.push(command), terminate: () => terminated++ }; }, 1000);
  const pending = engine.search({ fen: startFen, depth: 8, multiPv: 1, rootMoves: ['e2e4'] });
  for (const line of ['frame-ready', 'uciok', 'readyok', 'info depth 8 multipv 1 score cp 18 pv e2e4 e7e5', 'bestmove e2e4']) receive(line);
  assert.equal((await pending).bestmove, 'e2e4'); assert(commands.includes('go depth 8 searchmoves e2e4')); assert.equal(terminated, 1);
  const controller = new AbortController(), cancelled = engine.search({ fen: startFen, depth: 8, signal: controller.signal }); controller.abort();
  await assert.rejects(cancelled, /cancelled/); assert.equal(terminated, 2);
});
test('root barrel and compatibility adapter are deliberately not package exports', async () => {
  await assert.rejects(import('@knights-eye-chess/move-classifier'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  await assert.rejects(import('@knights-eye-chess/move-classifier/legacy-classifier-adapter'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
});

test('native Knight’s Eye policy classifies without engine acquisition from supplied position evidence', async () => {
  const { createKnightsEyePolicy, KNIGHTS_EYE_POLICY } = await import('@knights-eye-chess/move-classifier/policy/knights-eye');
  const board = new Chess(); board.move('e4');
  const supply = fakeEngine(), evidence = [];
  for (const fen of [startFen, board.fen()]) evidence.push({ kind: 'live-position', fen, analysis: await supply.search({ fen, depth: 18, multiPv: 3 }) });
  const core = createChessAnalyzerCore(Chess, undefined, createKnightsEyePolicy(Chess));
  const result = await core.classifySuppliedEvidence({ startFen, history: ['e2e4'], depth: 18, evidence });
  assert.equal(result.status, 'complete'); assert.deepEqual(result.policy, KNIGHTS_EYE_POLICY);
  assert.equal(typeof result.decision.classification, 'string'); assert.equal(typeof result.decision.qualityLoss, 'number');
  const incomplete = await core.classifySuppliedEvidence({ startFen, history: ['e2e4'], depth: 18, evidence: [] });
  assert.equal(incomplete.status, 'unavailable'); assert.equal('decision' in incomplete, false);
});
