import assert from 'node:assert/strict';
import test from 'node:test';
import { Chess } from 'chess.js';
import { createChessAnalyzerCore, classifySuppliedEvidence } from '@knights-eye-chess/move-classifier/core';

const startFen = new Chess().fen();
const baseRequest = { startFen, history: ['e2e4'], depth: 8 };
const uci = move => move.from + move.to + (move.promotion || '');
function fens(history = baseRequest.history, initial = startFen) {
  const board = new Chess(initial), all = [board.fen()];
  for (const move of history) { board.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) }); all.push(board.fen()); }
  return all;
}
function result(request, overrides = {}) {
  const board = new Chess(request.fen);
  const roots = request.rootMoves || board.moves({ verbose: true }).map(uci).slice(0, request.multiPv);
  const candidates = roots.map((root, index) => ({ multipv: index + 1, depth: request.depth, scoreCp: 20 - index * 10, mate: null, pv: [root], scoreProvenance: { kind: 'root-search', fen: request.fen, originatingDepth: request.depth, reportedDepth: request.depth, engineBuild: 'toy' } }));
  return { depth: request.depth, bestmove: roots[0], scoreCp: candidates[0].scoreCp, mate: null, candidates, ...overrides };
}
function evidence(request = baseRequest) {
  return fens(request.history, request.startFen).slice(-2).map(fen => ({ kind: 'live-position', fen, analysis: result({ fen, depth: request.depth, multiPv: 3 }) }));
}
function toy(options = {}) {
  const calls = { classify: 0, verify: 0 };
  const policy = {
    identity: { id: 'org.example/toy', revision: 1 },
    terminal: () => null,
    legalCount: fen => new Chess(fen).moves().length,
    materialExchangeForMove: () => null,
    exchange: () => ({ inherited: false, originFen: '' }),
    offer: () => ({ candidates: options.roots?.map(uci => ({ uci })) || [], verification: null }),
    verify: (_context, _state, lines) => { calls.verify++; return { depth: Math.min(...lines.map(line => line.depth)), acceptedRoot: lines[0].pv[0] }; },
    verificationSatisfies: (verification, depth) => verification.depth >= depth,
    priorPoints: () => 0,
    classify: context => { calls.classify++; if (options.throwOnClassify) throw new Error('toy policy failure'); return { classification: `toy:${context.move.uci}:${context.beforeAnalysis.bestmove}:${context.afterAnalysis.bestmove}:${context.book ? 'book' : 'nonbook'}` }; },
  };
  return { policy, calls };
}
function engine(options = {}) {
  const calls = [];
  return { calls, capabilities: options.capabilities, async search(request) { calls.push(request); return options.respond ? options.respond(request) : result(request); } };
}

test('acquired and supplied live evidence produce identical toy-policy decisions', async () => {
  const acquiredPolicy = toy(), acquiredEngine = engine();
  const acquired = await createChessAnalyzerCore(Chess, acquiredEngine, acquiredPolicy.policy).analyzeAndClassify(baseRequest);
  const suppliedPolicy = toy();
  const supplied = await classifySuppliedEvidence(Chess, suppliedPolicy.policy, { ...baseRequest, evidence: evidence() });
  assert.equal(acquired.status, 'complete'); assert.equal(supplied.status, 'complete');
  assert.deepEqual(supplied.decision, acquired.decision);
  assert.deepEqual(supplied.policy, acquired.policy);
  assert.equal(acquiredEngine.calls.length, 2);
  assert.equal(acquiredPolicy.calls.classify, 1); assert.equal(suppliedPolicy.calls.classify, 1);
});

test('no engine completes with full supplied evidence and reports missing evidence explicitly', async () => {
  const { policy, calls } = toy(), analyzer = createChessAnalyzerCore(Chess, undefined, policy);
  const complete = await analyzer.classifySuppliedEvidence({ ...baseRequest, evidence: evidence() });
  const missing = await analyzer.classifySuppliedEvidence({ ...baseRequest, evidence: evidence().slice(0, 1) });
  assert.equal(complete.status, 'complete');
  assert.equal(missing.status, 'unavailable'); assert.ok(missing.reason); assert.equal(missing.request.fen, fens()[1]);
  assert.equal(calls.classify, 1);
});

test('supplied path neither calls an available engine nor falls back to warmed engine cache', async () => {
  const { policy, calls } = toy(), source = engine(), analyzer = createChessAnalyzerCore(Chess, source, policy);
  assert.equal((await analyzer.analyzeAndClassify(baseRequest)).status, 'complete');
  assert.equal(source.calls.length, 2);
  const absent = await analyzer.classifySuppliedEvidence({ ...baseRequest, evidence: [] });
  assert.equal(absent.status, 'unavailable'); assert.equal(source.calls.length, 2);
  const supplied = await analyzer.classifySuppliedEvidence({ ...baseRequest, evidence: evidence() });
  assert.equal(supplied.status, 'complete'); assert.equal(source.calls.length, 2); assert.equal(calls.classify, 2);
});

test('malformed score, illegal PV, low depth, partial coverage and wrong FEN origin cannot classify', async t => {
  const bad = {
    'nonfinite score': report => ({ ...report, candidates: report.candidates.map((line, i) => i ? line : { ...line, scoreCp: NaN }) }),
    'illegal PV': report => ({ ...report, candidates: report.candidates.map((line, i) => i ? line : { ...line, pv: ['e2e5'] }) }),
    'low depth': report => ({ ...report, depth: report.depth - 1 }),
    'partial coverage': report => ({ ...report, candidates: report.candidates.slice(0, 2) }),
    'wrong FEN origin': report => ({ ...report, candidates: report.candidates.map((line, i) => i ? line : { ...line, scoreProvenance: { ...line.scoreProvenance, fen: startFen + ' foreign' } }) }),
  };
  for (const [name, corrupt] of Object.entries(bad)) await t.test(name, async () => {
    const { policy, calls } = toy();
    const source = engine({ respond: request => corrupt(result(request)) });
    const outcome = await createChessAnalyzerCore(Chess, source, policy).analyzeAndClassify(baseRequest);
    assert.equal(outcome.status, 'unavailable'); assert.equal(outcome.reason, 'incomplete-evidence');
    assert.equal(calls.classify, 0);
  });
});

test('engine capability declarations reject missing MultiPV and root-constrained search', async () => {
  const noMulti = engine({ capabilities: { multiPv: false, rootMoves: true } }), first = toy();
  const unavailable = await createChessAnalyzerCore(Chess, noMulti, first.policy).analyzeAndClassify(baseRequest);
  assert.equal(unavailable.status, 'unavailable'); assert.equal(unavailable.reason, 'unsupported-capability');
  assert.equal(noMulti.calls.length, 0); assert.equal(first.calls.classify, 0);
  const noRoots = engine({ capabilities: { multiPv: true, rootMoves: false } }), second = toy({ roots: ['e7e5', 'c7c5'] });
  const verification = await createChessAnalyzerCore(Chess, noRoots, second.policy).analyzeAndClassify(baseRequest);
  assert.equal(verification.status, 'unavailable'); assert.equal(verification.reason, 'unsupported-capability');
  assert.equal(noRoots.calls.length, 2); assert.equal(second.calls.classify, 0);
});

test('configured four candidates and depth-twelve verification constrain requested roots', async () => {
  const source = engine(), { policy, calls } = toy({ roots: ['e7e5', 'c7c5'] });
  const outcome = await createChessAnalyzerCore(Chess, source, policy, { searchPolicy: { candidateCount: 4, verificationDepth: 12 } }).analyzeAndClassify(baseRequest);
  assert.equal(outcome.status, 'complete'); assert.equal(calls.verify, 1); assert.equal(calls.classify, 1);
  assert.equal(source.calls.length, 3);
  assert.deepEqual(source.calls.map(request => [request.depth, request.multiPv, request.rootMoves || null]), [[8, 4, null], [8, 4, null], [12, 2, ['e7e5', 'c7c5']]]);
  assert.deepEqual(outcome.after.sacrificeVerification, { depth: 12, acceptedRoot: 'e7e5' });
});

test('cached evidence is reacquired when requested depth or candidate coverage rises', async () => {
  let legalLimit = 2;
  const { policy } = toy(); policy.legalCount = fen => Math.min(legalLimit, new Chess(fen).moves().length);
  const source = engine(), analyzer = createChessAnalyzerCore(Chess, source, policy, { searchPolicy: { candidateCount: 4, verificationDepth: 12 } });
  assert.equal((await analyzer.analyzeAndClassify(baseRequest)).status, 'complete');
  assert.equal(source.calls.length, 2); assert.deepEqual(source.calls.map(x => x.multiPv), [2, 2]);
  legalLimit = 4;
  assert.equal((await analyzer.analyzeAndClassify(baseRequest)).status, 'complete');
  assert.equal(source.calls.length, 4); assert.deepEqual(source.calls.slice(2).map(x => x.multiPv), [4, 4]);
  assert.equal((await analyzer.analyzeAndClassify({ ...baseRequest, depth: 11 })).status, 'complete');
  assert.equal(source.calls.length, 6); assert.deepEqual(source.calls.slice(4).map(x => x.depth), [11, 11]);
});

test('mutating a completed outcome cannot poison private engine evidence', async () => {
  const { policy } = toy(); policy.classify = context => ({ classification: String(context.afterAnalysis.scoreCp) });
  const source = engine(), analyzer = createChessAnalyzerCore(Chess, source, policy);
  const first = await analyzer.analyzeAndClassify(baseRequest);
  assert.equal(first.status, 'complete'); assert.equal(first.decision.classification, '20');
  first.after.scoreCp = 999;
  first.after.candidates[0].scoreCp = 999;
  first.after.candidates[0].pv[0] = 'a7a6';
  const second = await analyzer.analyzeAndClassify(baseRequest);
  assert.equal(second.status, 'complete'); assert.equal(second.decision.classification, '20');
  assert.equal(source.calls.length, 2);
});

test('extra runtime evidence on acquired API cannot bypass engine acquisition', async () => {
  const { policy } = toy(); policy.classify = context => ({ classification: String(context.afterAnalysis.scoreCp) });
  const forged = evidence().map(item => {
    const analysis = structuredClone(item.analysis);
    analysis.scoreCp = 999; analysis.candidates[0].scoreCp = 999;
    return { ...item, analysis };
  });
  const source = engine(), analyzer = createChessAnalyzerCore(Chess, source, policy);
  // JavaScript callers can pass undeclared fields, so the method boundary must enforce this at runtime.
  const acquired = await analyzer.analyzeAndClassify({ ...baseRequest, evidence: forged });
  assert.equal(acquired.status, 'complete'); assert.equal(acquired.decision.classification, '20');
  assert.equal(source.calls.length, 2);
});

test('policy fork and reset keep verification request-local, including supplied-only mode', async () => {
  const lifecycle = [];
  const { policy } = toy();
  policy.resetEvidence = () => lifecycle.push('base-reset');
  policy.fork = () => {
    lifecycle.push('fork');
    let retained = null;
    return { ...policy,
      resetEvidence() { lifecycle.push('request-reset'); retained = null; },
      offer() { return { candidates: [{ uci: 'e7e5' }, { uci: 'c7c5' }], verification: retained }; },
      verify(_context, _state, lines) { retained = { depth: Math.min(...lines.map(line => line.depth)), acceptedRoot: lines[0].pv[0] }; return retained; },
    };
  };
  const source = engine(), analyzer = createChessAnalyzerCore(Chess, source, policy);
  const acquired = await analyzer.analyzeAndClassify(baseRequest);
  assert.equal(acquired.status, 'complete'); assert.equal(source.calls.length, 3);
  const supplied = await analyzer.classifySuppliedEvidence({ ...baseRequest, evidence: evidence() });
  assert.equal(supplied.status, 'unavailable'); assert.equal(supplied.reason, 'incomplete-evidence');
  assert.deepEqual(supplied.request.rootMoves, ['e7e5', 'c7c5']);
  assert.equal(source.calls.length, 3);
  assert.deepEqual(lifecycle, ['fork', 'request-reset', 'fork', 'request-reset']);
  analyzer.clearEvidence();
  assert.deepEqual(lifecycle, ['fork', 'request-reset', 'fork', 'request-reset', 'base-reset']);
});

test('opening lookup receives custom root and exact history; explicit book override bypasses it', async () => {
  const custom = new Chess(); custom.move('d4');
  const request = { startFen: custom.fen(), history: ['d7d5'], depth: 8 };
  const seen = [], lookup = input => { seen.push(input); return { eco: 'X00', name: 'toy opening' }; };
  const { policy } = toy(), analyzer = createChessAnalyzerCore(Chess, engine(), policy, { openingLookup: lookup });
  const lookedUp = await analyzer.analyzeAndClassify(request);
  assert.equal(lookedUp.status, 'complete'); assert.equal(lookedUp.context.book, true);
  assert.deepEqual(seen, [{ startFen: request.startFen, history: request.history, afterFen: fens(request.history, request.startFen)[1] }]);
  const overridden = await analyzer.analyzeAndClassify({ ...request, book: false });
  assert.equal(overridden.status, 'complete'); assert.equal(overridden.context.book, false); assert.equal(seen.length, 1);
});

test('cancellation and invalid history are unavailable before classification', async () => {
  const { policy, calls } = toy(), source = engine(), analyzer = createChessAnalyzerCore(Chess, source, policy);
  const controller = new AbortController(); controller.abort();
  const cancelled = await analyzer.analyzeAndClassify({ ...baseRequest, signal: controller.signal });
  const invalid = await analyzer.analyzeAndClassify({ ...baseRequest, history: ['e2e5'] });
  assert.equal(cancelled.status, 'unavailable'); assert.equal(cancelled.reason, 'cancelled');
  assert.equal(invalid.status, 'unavailable'); assert.equal(invalid.reason, 'invalid-request');
  assert.equal(source.calls.length, 0); assert.equal(calls.classify, 0);
});

test('operational policy exceptions propagate instead of becoming unavailable', async () => {
  const { policy } = toy({ throwOnClassify: true });
  await assert.rejects(createChessAnalyzerCore(Chess, engine(), policy).analyzeAndClassify(baseRequest), /toy policy failure/);
});


test('clearing evidence during acquisition prevents stale in-flight cache repopulation', async () => {
  const { policy } = toy();
  let resume, started;
  const waiting = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { resume = resolve; });
  let count = 0;
  const source = { async search(request) {
    count++;
    if (count === 1) { started(); await gate; }
    return result(request);
  } };
  const analyzer = createChessAnalyzerCore(Chess, source, policy);
  const active = analyzer.analyzeAndClassify(baseRequest);
  await waiting;
  analyzer.clearEvidence();
  resume();
  assert.equal((await active).status, 'complete');
  assert.equal(count, 2);
  assert.equal((await analyzer.analyzeAndClassify(baseRequest)).status, 'complete');
  assert.equal(count, 4);
});
