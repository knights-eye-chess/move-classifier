import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { createKnightsEyePolicy } from '@knights-eye-chess/move-classifier/policy/knights-eye';
import { createChessAnalyzerCore, createAnalysisService } from '@knights-eye-chess/move-classifier/core';

const uciOf = m => m.from + m.to + (m.promotion || '');
const fen = 'k7/8/8/4K3/8/8/7P/8 w - - 0 1';
function position(root, roots, values, depth = 15) {
  const candidates = roots.map((uci, index) => ({ multipv: index + 1, depth,
    scoreCp: values[index]?.mate != null ? null : values[index]?.cp ?? 100,
    mate: values[index]?.mate ?? null, pv: [uci],
    scoreProvenance: { kind: 'root-search', fen: root, originatingDepth: depth, reportedDepth: depth, engineBuild: 'test' } }));
  return { ...candidates[0], bestmove: roots[0], candidates };
}
function context({ root = fen, move = 'e5e6', included = true, beforeValues = [{ cp: 100 }, { cp: 90 }, { cp: 80 }], afterValue = { cp: -100 }, beforeDepth = 15, afterDepth = 15 } = {}) {
  const chess = new Chess(root), legal = chess.moves({ verbose: true }).map(uciOf);
  const roots = (included ? [move] : []).concat(legal.filter(u => u !== move)).slice(0, 3);
  const played = chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
  const afterFen = chess.fen(), replies = chess.moves({ verbose: true }).map(uciOf).slice(0, 3);
  return { move: { ...played, uci: move }, beforeFen: root, afterFen,
    beforeAnalysis: position(root, roots, beforeValues, beforeDepth),
    afterAnalysis: position(afterFen, replies, replies.map(() => afterValue), afterDepth) };
}
const policy = () => createKnightsEyePolicy(Chess);

for (const [name, root, move] of [['White Ke6', fen, 'e5e6'], ['Black Ke3', '8/7p/8/8/4k3/8/8/K7 b - - 0 1', 'e4e3']]) {
  test(`${name}: coherent root best survives independent mate-to-cp change without recheck`, () => {
    const p = policy(), c = context({ root, move, beforeValues: [{ mate: 7 }, { mate: 8 }, { mate: 9 }], afterValue: { cp: -1300 } });
    const original = structuredClone(c);
    assert.equal(p.prepared.classificationComparison(c), null);
    const decision = p.classifyPrepared(c);
    assert.equal(decision.classification, 'best');
    assert.equal(decision.comparisonSource, 'root-candidate');
    assert.equal(decision.playedMate, 7);
    assert.deepEqual(c, original, 'independent after-search evidence must not be rewritten');
  });
}

test('same-band format changes remove mate inflation without hiding ordinary losses', () => {
  const p = policy();
  for (const options of [
    { included: false, beforeValues: [{ mate: 16 }, { mate: 17 }, { mate: 18 }], afterValue: { cp: -4200 } },
    { included: false, beforeValues: [{ cp: -8000 }, { cp: -8100 }, { cp: -8200 }], afterValue: { mate: 3 } },
  ]) {
    const c = context(options);
    assert.equal(p.prepared.classificationComparison(c), null);
    const d = p.classifyPrepared(c);
    assert.equal(d.classification, 'best');
    assert.equal(d.abandonedForcedMate, false);
    assert.equal(d.newlyAllowsMate, false);
  }
  const loss = context({ included: false, beforeValues: [{ mate: 16 }, { mate: 17 }, { mate: 18 }], afterValue: { cp: -500 } });
  const d = p.classifyPrepared(loss);
  assert.ok(d.epLoss > .20 && d.afterEp >= .68);
  assert.equal(d.classification, 'blunder', 'real within-band outcome loss remains visible');
});

test('ordinary absent-root losses, small noise and same-sign mate-distance drift do not recheck', () => {
  const p = policy();
  for (const c of [context({ afterValue: { cp: -110 } }),
    context({ beforeValues: [{ mate: 8 }, { mate: 9 }, { mate: 10 }], afterValue: { mate: -8 } }),
    context({ included: false, afterValue: { cp: 500 } })]) {
    assert.equal(p.prepared.classificationComparison(c), null);
  }
  assert.equal(p.classifyPrepared(context({ included: false, afterValue: { cp: 500 } })).classification, 'blunder');
});

test('conflicts use horizon alignment, and adequately deeper roots need no recheck', () => {
  const p = policy(), c = context({ afterValue: { cp: 500 } });
  const request = p.prepared.classificationComparison(c);
  assert.deepEqual(request, { fen, depth: 16, multiPv: 3, rootMoves: c.beforeAnalysis.candidates.map(line => line.pv[0]) });
  assert.equal(p.prepared.classificationComparison(context({ afterValue: { cp: 500 }, beforeDepth: 16 })), null);
  const absent = context({ included: false, afterValue: { cp: -800 } });
  assert.ok(p.prepared.classificationComparison(absent));
  const collapse = context({ included: false, beforeValues: [{ mate: 5 }, { mate: 6 }, { mate: 7 }], afterValue: { mate: 3 } });
  assert.ok(p.prepared.classificationComparison(collapse), 'opposing mate signs must be reconciled even for a genuine collapse');
});

test('verified mate-in-one remains a missed mate and avoids a speculative conflict recheck', () => {
  const root = '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', chess = new Chess(root);
  const mate = chess.moves({ verbose: true }).find(m => m.san.endsWith('#'));
  const move = chess.moves({ verbose: true }).find(m => { const copy = new Chess(root); copy.move(m); return !m.san.endsWith('#') && copy.moves().length; });
  const c = context({ root, move: uciOf(move), included: false, beforeValues: [{ mate: 1 }, { cp: 900 }, { cp: 800 }], afterValue: { cp: -900 } });
  c.beforeAnalysis = position(root, [uciOf(mate), ...c.beforeAnalysis.candidates.map(l => l.pv[0]).filter(u => u !== uciOf(mate)).slice(0, 2)], [{ mate: 1 }, { cp: 900 }, { cp: 800 }]);
  const p = policy();
  assert.equal(p.prepared.classificationComparison(c), null);
  assert.equal(p.classifyPrepared(c).missedImmediateMate, true);
  assert.equal(p.classifyPrepared(c).classification, 'miss');
});

test('restricted comparison settles quality, preserves unrestricted evidence and cannot create Great credit', () => {
  const p = policy(), c = context({ afterValue: { cp: 500 } }), request = p.prepared.classificationComparison(c);
  const roots = [request.rootMoves[1], request.rootMoves[0], request.rootMoves[2]];
  const result = position(fen, roots, [{ cp: 700 }, { cp: -500 }, { cp: -600 }], request.depth);
  const before = structuredClone(c.beforeAnalysis), after = structuredClone(c.afterAnalysis);
  c.comparisonAnalysis = p.prepared.admitClassificationComparison(c, request, result);
  assert.ok(c.comparisonAnalysis);
  assert.equal(p.prepared.classificationComparison(c), null, 'completed comparison settles once even if child still disagrees');
  const d = p.classifyPrepared(c);
  assert.equal(d.classification, 'blunder');
  assert.equal(d.comparisonBestmove, roots[0]); assert.equal(d.comparisonSource, 'comparison-root');
  assert.equal(d.greatMove, false); assert.equal(d.bestEp, p.prepared.expectedPoints(700));
  assert.deepEqual(c.beforeAnalysis, before); assert.deepEqual(c.afterAnalysis, after);
  const deeper = position(fen, request.rootMoves, [{ cp: 100 }, { cp: 90 }, { cp: 80 }], 17);
  c.beforeAnalysis = deeper;
  assert.equal(p.classifyPrepared(c).comparisonSource, 'root-candidate');
});

test('prepared admission rejects partial, shallow, illegal, foreign and bound comparison evidence', () => {
  const p = policy(), c = context({ afterValue: { cp: 500 } }), request = p.prepared.classificationComparison(c);
  const valid = position(fen, request.rootMoves, [], request.depth);
  for (const corrupt of [r => r.candidates.pop(), r => r.candidates[0].depth--,
    r => r.candidates[0].pv.push('a1a8'), r => r.candidates[0].scoreProvenance.fen = c.afterFen,
    r => r.candidates[0].upperbound = true, r => r.candidates[0].scoreCp = NaN, r => r.candidates[0].multipv = 2]) {
    const bad = structuredClone(valid); corrupt(bad);
    assert.equal(p.prepared.admitClassificationComparison(c, request, bad), null);
  }
});

function coreFixture({ fail = false, incomplete = false, abort = null } = {}) {
  const c = context({ afterValue: { cp: 500 } }), calls = [];
  const engine = { async search(request) {
    calls.push({ ...request });
    if (request.rootMoves) {
      if (abort) abort.abort();
      if (fail) throw new Error('timeout');
      const result = position(request.fen, request.rootMoves, [], request.depth);
      if (incomplete) result.candidates.pop();
      return result;
    }
    return structuredClone(request.fen === c.beforeFen ? c.beforeAnalysis : c.afterAnalysis);
  } };
  const core = createChessAnalyzerCore(Chess, engine, policy());
  return { core, calls, c, request: { startFen: fen, history: ['e5e6'], depth: 15 } };
}

test('public core rechecks once, retains complete comparison locally and clears budget with evidence', async () => {
  const f = coreFixture();
  const first = await f.core.analyzeAndClassify(f.request);
  assert.equal(first.status, 'complete'); assert.equal(first.decision.comparisonSource, 'comparison-root');
  assert.equal(f.calls.filter(r => r.rootMoves).length, 1);
  const second = await f.core.analyzeAndClassify(f.request);
  assert.equal(second.status, 'complete'); assert.deepEqual(second.decision, first.decision);
  assert.equal(f.calls.length, 3, 'restricted evidence never overwrites unrestricted cache');
  f.core.clearEvidence();
  assert.equal((await f.core.analyzeAndClassify(f.request)).status, 'complete');
  assert.equal(f.calls.filter(r => r.rootMoves).length, 2);
});

for (const kind of ['fail', 'incomplete']) test(`public core ${kind} comparison is unavailable and is not retried on later calls`, async () => {
  const f = coreFixture({ [kind]: true });
  const first = await f.core.analyzeAndClassify(f.request);
  assert.equal(first.status, 'unavailable'); assert.equal('decision' in first, false);
  assert.equal((await f.core.analyzeAndClassify({ ...f.request, depth: 14 })).reason, 'comparison-unavailable');
  assert.equal(f.calls.filter(r => r.rootMoves).length, 1);
});

test('comparison cancellation never publishes a decision or successful comparison cache entry', async () => {
  const abort = new AbortController(), f = coreFixture({ abort });
  const first = await f.core.analyzeAndClassify({ ...f.request, signal: abort.signal });
  assert.equal(first.status, 'unavailable'); assert.equal(first.reason, 'cancelled');
  assert.equal((await f.core.analyzeAndClassify(f.request)).reason, 'comparison-unavailable');
});

test('supplied-only path needs an explicit complete comparison and never reuses acquired proof', async () => {
  const f = coreFixture();
  assert.equal((await f.core.analyzeAndClassify(f.request)).status, 'complete');
  const evidence = [f.c.beforeFen, f.c.afterFen].map((root, index) => ({ kind: 'live-position', fen: root, analysis: index ? f.c.afterAnalysis : f.c.beforeAnalysis }));
  const missing = await f.core.classifySuppliedEvidence({ ...f.request, evidence });
  assert.equal(missing.status, 'unavailable'); assert.equal(missing.reason, 'incomplete-evidence');
  const request = policy().prepared.classificationComparison(f.c);
  evidence.push({ kind: 'live-position', fen, rootMoves: request.rootMoves, analysis: position(fen, request.rootMoves, [], request.depth) });
  assert.equal((await f.core.classifySuppliedEvidence({ ...f.request, evidence })).status, 'complete');
  assert.equal(f.calls.length, 3);
});


test('host-carried completed comparison is re-admitted at its own depth without another live-tick search', async () => {
  const p = policy(), c = context({ afterValue: { cp: 500 } });
  const request = p.prepared.classificationComparison(c);
  const comparison = p.prepared.admitClassificationComparison(c, request, position(fen, request.rootMoves, [], request.depth));
  c.afterAnalysis = position(c.afterFen, c.afterAnalysis.candidates.map(l => l.pv[0]), [{ cp: 500 }, { cp: 500 }, { cp: 500 }], 30);
  c.comparisonAnalysis = comparison;
  let calls = 0;
  const service = createAnalysisService(p, { async search() { calls++; throw Error('Unexpected search'); } }, {
    get(root) { return structuredClone(root === fen ? c.beforeAnalysis : c.afterAnalysis); }, put() {},
  });
  const outcome = await service.analyzeAndClassify({ context: c, depth: 15, comparisonKey: 'occurrence' });
  assert.equal(outcome.status, 'complete'); assert.equal(outcome.decision.comparisonSource, 'comparison-root'); assert.equal(calls, 0);
  const foreign = structuredClone(c);
  foreign.comparisonAnalysis.candidates.forEach(line => { line.scoreProvenance.engineBuild = 'other'; });
  assert.equal((await service.analyzeAndClassify({ context: foreign, depth: 15, comparisonKey: 'other' })).reason, 'incomplete-evidence');
  const missing = structuredClone(c);
  missing.comparisonAnalysis.candidates.shift();
  assert.equal((await service.analyzeAndClassify({ context: missing, depth: 15, comparisonKey: 'missing' })).status, 'unavailable');
});

test('comparison confirms genuine opposing mate collapse without promoting restricted alternatives', () => {
  const p = policy(), c = context({ included: false, beforeValues: [{ mate: 5 }, { mate: 6 }, { mate: 7 }], afterValue: { mate: 3 } });
  const request = p.prepared.classificationComparison(c), roots = [request.rootMoves[1], request.rootMoves[0], request.rootMoves[2]];
  c.comparisonAnalysis = p.prepared.admitClassificationComparison(c, request, position(fen, roots, [{ mate: 5 }, { mate: -4 }, { mate: -5 }], request.depth));
  const d = p.classifyPrepared(c);
  assert.equal(d.classification, 'blunder'); assert.equal(d.playedMate, -4); assert.equal(d.bestMate, 5);
  assert.equal(p.prepared.classificationComparison(c), null);
});


test('actual checkmate and stalemate override contradictory root candidate scores', () => {
  const p = policy(), root = '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', board = new Chess(root);
  for (const terminal of ['mate', 'stalemate']) {
    const move = board.moves({ verbose: true }).find(m => { const next = new Chess(root); next.move(m); return terminal === 'mate' ? next.isCheckmate() : next.isStalemate(); });
    assert.ok(move);
    const c = context({ root, move: uciOf(move), beforeValues: [{ cp: 1000 }, { cp: 950 }, { cp: 900 }] });
    c.afterAnalysis = p.prepared.terminalPositionResult(c.afterFen, 15);
    c.comparisonAnalysis = structuredClone(c.beforeAnalysis); // stale local proof also cannot outrank a terminal board
    const d = p.classifyPrepared(c);
    assert.equal(p.prepared.classificationComparison(c), null);
    assert.equal(d.comparisonSource, terminal === 'mate' ? 'checkmate' : 'terminal-position');
    assert.equal(d.afterEp, terminal === 'mate' ? 1 : .5);
    assert.equal(d.mateMove, terminal === 'mate');
    if (terminal === 'mate') assert.equal(d.classification, 'best');
    else { assert.equal(d.playedBest, false); assert.equal(d.classification, 'blunder'); }
  }
});

for (const [color, root, move] of [['White', fen, 'e5e6'], ['Black', '8/7p/8/8/4k3/8/8/K7 b - - 0 1', 'e4e3']]) {
  for (const [band, values, after] of [
    ['winning', [{ mate: 16 }, { cp: 4000 }, { cp: 3900 }], { cp: -4197 }],
    ['losing', [{ cp: -4000 }, { mate: -16 }, { mate: -15 }], { cp: 4197 }],
  ]) test(`${color}: ${band} mate/cp alternatives cannot fabricate uniqueness`, () => {
    const p = policy(), c = context({ root, move, included: false, beforeValues: values, afterValue: after });
    const d = p.classifyPrepared(c);
    assert.equal(p.prepared.classificationComparison(c), null);
    assert.ok(!['great', 'brilliant'].includes(d.classification));
    assert.equal(d.onlyViable, false);
    assert.equal(d.uniqueGap, Math.max(0, d.bestEp - d.secondEp));
    assert.equal(d.bestSpecial.onlyViable, false);
    assert.equal(d.bestSpecial.uniqueGap, d.uniqueGap);
    assert.equal(d.bestSpecial.qualifies, false);
    assert.equal(d.missedSpecial, false);
  });
  test(`${color}: genuine only-move mate still qualifies as Great`, () => {
    const d = policy().classifyPrepared(context({ root, move, beforeValues: [{ mate: 16 }, { cp: 0 }, { cp: -100 }], afterValue: { mate: -15 } }));
    assert.equal(d.classification, 'great');
    assert.equal(d.onlyViable, true);
    assert.equal(d.bestSpecial.qualifies, true);
    assert.ok(d.uniqueGap >= .075);
  });
  test(`${color}: two mate scores retain existing uniqueness utility`, () => {
    const d = policy().classifyPrepared(context({ root, move, beforeValues: [{ mate: 3 }, { mate: 16 }, { mate: 17 }], afterValue: { mate: -2 } }));
    assert.equal(d.uniqueGap, Math.max(0, d.bestUtility - d.secondUtility));
    assert.equal(d.onlyViable, d.uniqueGap >= .075);
  });
}
