import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { createKnightsEyePolicy } from '@knights-eye-chess/move-classifier/policy/knights-eye';
import { createAnalysisService } from '@knights-eye-chess/move-classifier/core';
import { createKnightsEyePolicyRuntime } from '@knights-eye-chess/move-classifier/compatibility';

const policy = createKnightsEyePolicy(Chess);
function played(fen, san) {
  const board = new Chess(fen), move = board.move(san);
  return { beforeFen: fen, afterFen: board.fen(), move: { ...move, uci: move.lan } };
}

test('unsafe offers distinguish equal trades, lower attackers, rook-for-two-minors and x-ray batteries', () => {
  const unsafe = (fen, white, square = '') => policy.prepared.unsafePieces(fen, white, square);
  assert.ok(!unsafe('4k3/8/4p3/3n4/2B5/8/8/4K3 w - - 0 1', false).includes('d5'),
    'a defended equal minor is not an offer');
  assert.ok(unsafe('6k1/8/8/3p4/4R3/5P2/8/6K1 w - - 0 1', true).includes('e4'),
    'a cheaper pawn attacker takes precedence over a pawn defender');
  const rook = '6k1/8/5n2/3R4/4P3/8/8/6K1 b - - 0 1';
  assert.ok(unsafe(rook, true).includes('d5'));
  assert.ok(!unsafe(rook, true, 'd5').includes('d5'),
    'a rook just taking a minor is safe from one minor with a defender');
  const oneBishop = 'k7/6b1/8/8/3N4/2B5/8/K7 w - - 0 1';
  const battery = 'k6b/6b1/8/8/3N4/2B5/8/K7 w - - 0 1';
  assert.ok(!unsafe(oneBishop, true).includes('d4'));
  assert.ok(unsafe(battery, true).includes('d4'));
  assert.ok(!unsafe('7k/3r4/8/8/r2R4/8/3R4/3R3K w - - 0 1', true).includes('d4'),
    'a compatible defending rook battery balances two rook attackers');
});

test('trapped check uses mover legal escapes, and rescue does not erase a new higher piece offer', () => {
  const trapped = 'rnq1k3/1b1p4/p1nP1rpB/5pN1/1pP1p3/3B4/P1P1QPPP/R3R1K1 w q - 2 23';
  assert.ok(policy.prepared.trappedUnsafePieces(trapped, true, policy.prepared.unsafePieces(trapped, true, '')).includes('d3'));
  const higher = played('4r1k1/8/8/3p4/4N3/8/8/4R1K1 w - - 0 1', 'Nc5');
  assert.deepEqual(policy.prepared.unsafePieces(higher.beforeFen, true, ''), ['e4']);
  assert.deepEqual(policy.prepared.unsafePieces(higher.afterFen, true, ''), ['e1']);
  assert.ok(policy.prepared.sacrificeCaptureCandidates(higher.move, higher.beforeFen, higher.afterFen).some(candidate => candidate.uci === 'e8e1'));
  const rescue = played('2k4r/ppB5/4N2b/5b2/6n1/2P5/1P3P2/3RN1K1 w - - 1 30', 'Nd4');
  assert.deepEqual(policy.prepared.sacrificeCaptureCandidates(rescue.move, rescue.beforeFen, rescue.afterFen), [],
    '30.Nd4 saves the attacked knight while exposing an equal-value bishop');
});

test('a losing legal acceptance refutes a promising offered capture', () => {
  const context = played('2kr1b1r/pp1n1ppp/2p1pnb1/q7/2B4P/2NP1N2/PPPBQP2/2KR2R1 w - - 4 14', 'Nd5');
  const state = policy.offer(context, {}, '');
  assert.ok(state.candidates.length >= 2);
  const lines = state.candidates.map((candidate, index) => ({ depth: 10, scoreCp: index === 1 ? 1000 : -50, mate: null, pv: [candidate.uci] }));
  const verification = policy.verify(context, state, lines);
  assert.ok(verification.coverageComplete);
  assert.ok(verification.worstAcceptedEp < .4);
  assert.deepEqual(['materialPath', 'materialThreadPath', 'persistentMaterialOffer',
    'materialConversionGain', 'voluntaryOfferCap'].filter(field => Object.hasOwn(verification, field)), [],
    'Brilliant proof carries board stake and engine outcome, not a PV material path');
  context.beforeAnalysis = { depth: 15, scoreCp: 20, mate: null, bestmove: context.move.uci,
    candidates: [{ depth: 15, scoreCp: 20, mate: null, pv: [context.move.uci] }, { depth: 15, scoreCp: 0, mate: null, pv: ['a5a6'] }] };
  context.afterAnalysis = { depth: 15, scoreCp: -20, mate: null, candidates: [], sacrificeVerification: verification };
  const decision = policy.classify(context);
  assert.equal(decision.sacrifice, false);
  assert.notEqual(decision.classification, 'brilliant');
});

test('declined recapture compares all forcing replies independently of acceptance PV order', () => {
  const declined = played('8/p1p2k1p/5np1/8/1b1p4/3P4/PP1B1q1P/RN1KR3 b - - 4 22', 'Nd5');
  const declinedState = policy.offer(declined, {}, '');
  assert.deepEqual(declinedState.candidates.map(candidate => candidate.uci), ['d2b4']);
  assert.equal(declinedState.candidates[0].offerMode, 'declined-recapture');
  const traded = policy.verify(declined, declinedState, [{ depth: 10, scoreCp: 0, mate: null, pv: ['d2b4', 'd5b4'] }]);
  const offered = policy.verify(declined, declinedState, [{ depth: 10, scoreCp: 0, mate: null, pv: ['d2b4', 'f2b2'] }]);
  assert.equal(traded.qualifyingMaterialOffer, 0);
  assert.equal(offered.qualifyingMaterialOffer, 0);
  const [request] = policy.continuationRequests(declined, declinedState, traded);
  assert.equal(request.depth, 10);
  assert.ok(request.rootMoves.includes('d5b4') && request.rootMoves.includes('f2b2'));
  const comparison = (replyCp) => {
    const roots = replyCp >= 0 ? ['f2b2', 'd5b4', ...request.rootMoves.filter(root => !['f2b2', 'd5b4'].includes(root))]
      : ['d5b4', ...request.rootMoves.filter(root => root !== 'd5b4')];
    const candidates = roots.map((root, index) => ({ multipv: index + 1, depth: 10, scoreCp: root === 'f2b2' ? replyCp : root === 'd5b4' ? 0 : -1000, mate: null, pv: [root] }));
    return { ...candidates[0], bestmove: roots[0], candidates };
  };
  const evidence = analysis => [{ request, analysis }];
  for (const primary of [traded, offered]) {
    const proved = policy.verifyContinuations(declined, declinedState, primary, evidence(comparison(10)));
    assert.equal(proved.qualifyingMaterialOffer, 330);
    assert.equal(proved.continuationStatus, 'qualified');
  }
  const unsound = policy.verifyContinuations(declined, declinedState, traded, evidence(comparison(-1000)));
  assert.equal(unsound.qualifyingMaterialOffer, 0);
  const deeperPrimary = policy.verify(declined, declinedState, [{ depth: 15, scoreCp: 0, mate: null, pv: ['d2b4', 'd5b4'] }]);
  const [deeperRequest] = policy.continuationRequests(declined, declinedState, deeperPrimary);
  assert.equal(deeperRequest.depth, 15);
  assert.equal(policy.verifyContinuations(declined, declinedState, deeperPrimary,
    [{ request: deeperRequest, analysis: comparison(10) }]), null,
    'a depth-ten continuation cannot prove a depth-fifteen primary offer');

  const check = played('rnq1k3/1b1p4/p1nP1rpB/5pN1/1pP1p3/3B4/P1P1QPPP/R3R1K1 w q - 2 23', 'Bxe4');
  const checkState = policy.offer(check, {}, '');
  assert.deepEqual(checkState.candidates.map(candidate => candidate.uci), ['f5e4']);
  assert.equal(checkState.candidates[0].offerMode, 'forcing-check');
  const forced = policy.verify(check, checkState, [{ depth: 10, scoreCp: null, mate: -2, pv: ['f5e4', 'e2e4'] }]);
  assert.ok(forced.forcingCheckWitness);
  assert.ok(forced.qualifyingMaterialOffer >= 120);
});

test('service acquires and admits the exact post-acceptance continuation scope', async () => {
  const context = played('8/p1p2k1p/5np1/8/1b1p4/3P4/PP1B1q1P/RN1KR3 b - - 4 22', 'Nd5');
  const accepted = new Chess(context.afterFen); accepted.move('Bxb4');
  const acceptedFen = accepted.fen();
  const calls = [], responses = [];
  const legal = (fen, pv) => { const board = new Chess(fen); return pv.every(uci => !!board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })); };
  const engine = { capabilities: { multiPv: true, rootMoves: true }, async search(request) {
    calls.push(request);
    let roots, values;
    if (request.fen === context.beforeFen) {
      roots = [context.move.uci, ...new Chess(request.fen).moves({ verbose: true }).map(move => move.lan).filter(uci => uci !== context.move.uci).slice(0, 2)];
      values = [100, 0, -100];
    } else if (request.fen === context.afterFen && !request.rootMoves) {
      roots = new Chess(request.fen).moves({ verbose: true }).map(move => move.lan).filter(uci => uci !== 'd2b4').slice(0, 3);
      values = [-100, -200, -300];
    } else if (request.fen === context.afterFen) {
      roots = request.rootMoves;
      values = roots.map(() => -100);
    } else {
      assert.equal(request.fen, acceptedFen);
      roots = ['f2b2', 'd5b4', ...request.rootMoves.filter(uci => !['f2b2', 'd5b4'].includes(uci))];
      values = roots.map(uci => uci === 'f2b2' ? 100 : uci === 'd5b4' ? 0 : -1000);
    }
    const candidates = roots.map((uci, index) => ({ multipv: index + 1, depth: request.depth, scoreCp: values[index], mate: null, pv: [uci],
      scoreProvenance: { kind: 'root-search', fen: request.fen, originatingDepth: request.depth, reportedDepth: request.depth, engineBuild: 'test' } }));
    const result = { ...candidates[0], bestmove: roots[0], candidates };
    responses.push({ request, result });
    return result;
  } };
  const service = createAnalysisService(policy, engine, undefined, { legalPv: legal });
  const outcome = await service.analyzeAndClassify({ context, depth: 15 });
  assert.equal(outcome.status, 'complete');
  assert.equal(outcome.decision.classification, 'brilliant');
  const continuation = calls.find(request => request.fen === acceptedFen);
  assert.ok(continuation);
  assert.ok(continuation.rootMoves.includes('d5b4') && continuation.rootMoves.includes('f2b2'));
  assert.equal(continuation.depth, 10);
  assert.equal(outcome.decision.sacrificeVerification.continuationStatus, 'qualified');

  const evidence = responses.filter(item => item.request.fen !== acceptedFen).map(item => ({ kind: 'live-position', fen: item.request.fen,
    ...(item.request.rootMoves ? { rootMoves: item.request.rootMoves } : {}), analysis: item.result }));
  const supplied = createAnalysisService(policy, undefined, undefined, { legalPv: legal });
  const missing = await supplied.analyzeAndClassify({ context, depth: 15, evidence, suppliedOnly: true });
  assert.equal(missing.status, 'unavailable');
  assert.equal(missing.reason, 'incomplete-evidence');
  assert.equal(missing.request.fen, acceptedFen);
  assert.deepEqual(missing.request.rootMoves, continuation.rootMoves);

  const shallow = createAnalysisService(policy, engine, undefined, { legalPv: legal,
    searchPolicy: { candidateCount: 3, verificationDepth: 5 } });
  const shallowOutcome = await shallow.analyzeAndClassify({ context, depth: 15 });
  assert.equal(shallowOutcome.status, 'complete');
  assert.equal(shallowOutcome.decision.classification, 'brilliant');
  assert.equal(calls.findLast(request => request.fen === acceptedFen).depth, 5,
    'continuation depth follows the admitted primary verification depth');
});

test('already-winning alternative is blocked unless played-line mate alone is evidenced', () => {
  const base = played('r1b3k1/p1p2rp1/1p4q1/2N2p2/1P3R2/1QPP2pP/P5P1/R5K1 w - - 2 22', 'Re1');
  const state = policy.offer(base, {}, '');
  const proof = policy.verify(base, state, [{ depth: 10, scoreCp: -100, mate: null, pv: ['b6c5'] }]);
  assert.ok(proof.qualifyingMaterialOffer >= 120);
  const rootLine = (cp, mate, uci) => ({ depth: 15, scoreCp: cp, mate, pv: [uci] });
  const decision = ({ playedMate = null, alternativeMate = null, childMate = null, acceptedMate = null } = {}) => {
    const selectedProof = { ...proof, scoreCp: acceptedMate == null ? proof.scoreCp : null, mate: acceptedMate };
    const played = rootLine(playedMate == null ? 1500 : null, playedMate, base.move.uci);
    const alternative = rootLine(alternativeMate == null ? 1450 : null, alternativeMate, 'f4f2');
    return policy.classify({ ...base, beforeAnalysis: { ...played, bestmove: base.move.uci, candidates: [played, alternative] },
      afterAnalysis: { scoreCp: childMate == null ? -1500 : null, mate: childMate, candidates: [], sacrificeVerification: selectedProof } });
  };
  assert.equal(decision().sacrifice, false, 'two cp-winning moves do not make a Brilliant');
  assert.equal(decision({ playedMate: 5 }).sacrifice, true);
  assert.equal(decision({ playedMate: 5, alternativeMate: 8 }).sacrifice, false);
  assert.equal(decision({ childMate: -5 }).sacrifice, true, 'admitted child mate survives a root cp score');
  assert.equal(decision({ childMate: 5 }).sacrifice, false, 'wrong-side mate cannot establish the exception');
  assert.equal(decision({ acceptedMate: -5 }).sacrifice, false, 'acceptance-line mate is not played-line evidence');
  const playedLine = rootLine(null, 5, base.move.uci), modest = rootLine(0, null, 'f4f2');
  const comparisonPlayed = { ...rootLine(1500, null, base.move.uci), depth: 16 };
  const comparisonAlt = { ...rootLine(1450, null, 'f4f2'), depth: 16 };
  const reconciled = policy.classify({ ...base, beforeAnalysis: { ...playedLine, bestmove: base.move.uci, candidates: [playedLine, modest] },
    afterAnalysis: { scoreCp: -1500, mate: null, candidates: [], sacrificeVerification: proof },
    comparisonAnalysis: { ...comparisonPlayed, bestmove: base.move.uci, candidates: [comparisonPlayed, comparisonAlt] } });
  assert.equal(reconciled.comparisonSource, 'comparison-root');
  assert.equal(reconciled.sacrifice, false, 'reconciliation can remove stale Brilliant credit');
});

test('explicit selected verification is scoped to one native classification call', () => {
  const native = createKnightsEyePolicyRuntime(Chess);
  const context = played('r1b3k1/p1p2rp1/1p4q1/2N2p2/1P3R2/1QPP2pP/P5P1/R5K1 w - - 2 22', 'Re1');
  const state = native.offer(context, {}, '');
  assert.equal(state.candidates.length, 1);
  context.beforeAnalysis = { depth: 15, scoreCp: 50, mate: null, bestmove: context.move.uci,
    candidates: [{ depth: 15, scoreCp: 50, mate: null, pv: [context.move.uci] },
      { depth: 15, scoreCp: 0, mate: null, pv: ['f4f2'] }] };
  context.afterAnalysis = { depth: 15, scoreCp: -50, mate: null,
    candidates: [{ depth: 10, scoreCp: -80, mate: null, pv: [state.candidates[0].uci] }] };
  assert.equal(native.classify(structuredClone(context)).sacrificeVerification.depth, 10);
  const selected = native.verify(context, state, [{ depth: 18, scoreCp: -80, mate: null, pv: [state.candidates[0].uci] }]);
  assert.equal(native.classify(context, selected).sacrificeVerification.depth, 18);
  assert.equal(context.afterAnalysis.sacrificeVerification, undefined,
    'an explicit override must not write into caller-owned evidence');
  assert.throws(() => native.classify(context, { ...selected, candidateScopeKey: 'foreign' }),
    /does not match the classified move context/);
  assert.equal(native.classify(context).sacrificeVerification.depth, 10,
    'the selected depth must not leak through the shared verification cache');
});
