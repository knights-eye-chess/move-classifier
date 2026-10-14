import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { createKnightsEyePolicy } from '@knights-eye-chess/move-classifier/policy/knights-eye';
import { createAnalysisService } from '@knights-eye-chess/move-classifier/core';
import { createKnightsEyePolicyRuntime } from '@knights-eye-chess/move-classifier/compatibility';

const policy = createKnightsEyePolicy(Chess);
function played(fen, san) {
  const board = new Chess(fen), move = board.move(san);
  return { beforeFen: fen, afterFen: board.fen(), move: { ...move, uci: move.lan } };
}
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/brilliant-corpus.json', import.meta.url)));
function fixtureMove(name, ply) {
  const fixture = [...fixtures.fixtures, ...fixtures.interestingFixtures, ...fixtures.addedFixtures]
    .find(item => item.name === name);
  assert.ok(fixture, `Missing fixture ${name}`);
  const game = new Chess(); game.loadPgn(fixture.pgn);
  const moves = game.history({ verbose: true }), board = new Chess(game.header().FEN || undefined);
  const fens = [board.fen()];
  for (const move of moves) { board.move(move.lan); fens.push(board.fen()); }
  const index = ply - 1;
  return { move: { ...moves[index], uci: moves[index].lan }, beforeFen: fens[index], afterFen: fens[index + 1],
    previousMove: index ? { ...moves[index - 1], uci: moves[index - 1].lan } : null,
    priorFen: index >= 1 ? fens[index - 1] : '', priorOwnBeforeFen: index >= 2 ? fens[index - 2] : '' };
}

function replayMove(initialFen, sans) {
  const board = new Chess(initialFen), fens = [board.fen()], moves = [];
  for (const san of sans) { moves.push(board.move(san)); fens.push(board.fen()); }
  const index = moves.length - 1;
  return { move: { ...moves[index], uci: moves[index].lan }, beforeFen: fens[index], afterFen: fens[index + 1],
    previousMove: { ...moves[index - 1], uci: moves[index - 1].lan },
    priorFen: fens[index - 1], priorOwnBeforeFen: fens[index - 2] };
}

test('standing offers require exact legal history and a net prior material deficit', () => {
  const offer = (context, uci) => policy.offer(context, {}, '').candidates.find(candidate => candidate.uci === uci);
  const qh4 = fixtureMove('FixturePlayer002 vs FixturePlayer003', 16);
  assert.equal(offer(qh4, 'c3d4')?.requiresSettledDeficit, true,
    '8...Qh4 needs settled material evidence for the knight newly attacked by 8.c3');
  assert.equal(offer(qh4, 'c3d4')?.settledRecoveryResidual, -10,
    'Qxe4+ restores the offered knight value on another square');
  assert.ok(!policy.offer(qh4, {}, '').candidates.some(candidate => candidate.offerMode === 'declined-recapture'),
    '8...Qh4 cannot enter through the separate declined-recapture witness');
  const bb4 = fixtureMove('FixturePlayer001 vs FixturePlayer004', 29);
  assert.equal(offer(bb4, 'c6d5')?.requiresSettledDeficit, false, '15.Bb4 retains the knight offer available before 14...Qc5');
  assert.ok(!offer({ ...bb4, priorFen: '' }, 'c6d5'), 'an absent exact branch history cannot prove a standing offer');
  assert.ok(!offer({ ...bb4, priorFen: qh4.priorFen }, 'c6d5'), 'a foreign or transposed history cannot prove a standing offer');
  const nxc3 = fixtureMove('FixturePlayer001 vs FixturePlayer020', 17);
  assert.equal(offer(nxc3, 'f8f7')?.requiresSettledDeficit, false, '9.Nxc3 retains the declined bishop offer');
  const re1 = fixtureMove('Owner game B 22.Re1 offer', 43);
  assert.equal(offer(re1, 'b6c5')?.requiresSettledDeficit, false, '22.Re1 retains a geometric capture temporarily barred by check');
  const pinned = replayMove('4k3/4p3/8/2B5/8/8/8/4R1K1 w - - 0 1', ['Bd6', 'Kf7', 'Kh2']);
  assert.ok(!new Chess(pinned.priorFen).moves({ verbose: true }).some(move => move.to === 'd6'),
    'the prior pawn capture is illegal while pinned');
  assert.equal(offer(pinned, 'e7d6')?.requiresSettledDeficit, false, 'the same prior capture still existed by piece geometry');
  const defendedKingTarget = replayMove('4k3/5R1r/8/8/8/8/8/4KR2 w - - 0 1', ['Kd1', 'Rg7', 'Ke2']);
  assert.ok(!new Chess(defendedKingTarget.priorFen).moves({ verbose: true }).some(move => move.from === 'e8' && move.to === 'f7'),
    'the black king cannot take the rook while another white rook defends f7');
  assert.equal(offer(defendedKingTarget, 'g7f7')?.requiresSettledDeficit, true,
    'a geometrically adjacent king cannot establish a prior offer by entering a defended square');
  const initial = '4k3/1p6/8/8/2B5/8/8/4K3 w - - 0 1';
  const quietOffer = replayMove(initial, ['Ba6', 'Kf7', 'Kd2']);
  assert.equal(offer(quietOffer, 'b7a6')?.requiresSettledDeficit, false, 'a genuinely declined bishop offer remains eligible');
  const tookRook = replayMove('4k3/1p6/r7/8/2B5/8/8/4K3 w - - 0 1', ['Bxa6', 'Kf7', 'Kd2']);
  assert.equal(offer(tookRook, 'b7a6')?.requiresSettledDeficit, true, 'capturing a rook first leaves no prior net material offer');
  const tookKnight = replayMove('4k3/1p6/n7/8/2B5/8/8/4K3 w - - 0 1', ['Bxa6', 'Kf7', 'Kd2']);
  assert.equal(offer(tookKnight, 'b7a6')?.requiresSettledDeficit, true, 'an equal piece trade is not a prior net offer');
  const relocated = played('4k3/1p6/8/1p6/R7/8/8/4K3 w - - 0 1', 'Ra6');
  assert.equal(offer(relocated, 'b7a6')?.requiresSettledDeficit, false,
    'moving an already attacked rook to a different capturable square creates a new board offer');
  const castled = replayMove('4k3/1p6/B7/8/8/8/8/4K2R w K - 0 1', ['O-O', 'Kd7', 'Kh2']);
  assert.equal(offer(castled, 'b7a6')?.requiresSettledDeficit, false, 'exact prior history admits castling');
  const enPassant = replayMove('4k3/1p6/B7/3pP3/8/8/8/4K3 w - d6 0 1', ['exd6', 'Kf7', 'Kd2']);
  assert.equal(offer(enPassant, 'b7a6')?.requiresSettledDeficit, false, 'exact prior history admits en passant');
  const promotion = replayMove('4k3/1p4P1/R7/8/8/8/8/4K3 w - - 0 1', ['g8=N', 'Kf7', 'Kd2']);
  assert.equal(offer(promotion, 'b7a6')?.requiresSettledDeficit, false, 'exact prior history admits promotion with net material accounting');
});

test('newly attacked offers need a persistent material deficit after legal exchange settlement', () => {
  const line = (uci, cp) => ({ depth: 15, scoreCp: cp, mate: null, pv: [uci] });
  const decide = (context, acceptance, bestCp = 20) => {
    const state = policy.offer(context, {}, '');
    const proof = policy.verify(context, state, [{ depth: 10, scoreCp: -100, mate: null, pv: [acceptance] }]);
    const played = line(context.move.uci, bestCp), alternative = line('a2a3', bestCp - 10);
    return { proof, decision: policy.classify({ ...context,
      beforeAnalysis: { ...played, bestmove: context.move.uci, candidates: [played, alternative] },
      afterAnalysis: { depth: 15, scoreCp: -bestCp, mate: null, candidates: [], sacrificeVerification: proof } }) };
  };
  const qh4 = fixtureMove('FixturePlayer002 vs FixturePlayer003', 16);
  const qh4Result = decide(qh4, 'c3d4');
  assert.equal(qh4Result.proof.requiresSettledDeficit, true);
  assert.equal(qh4Result.proof.directRecoveryResidual, 220, 'same-square recapture misses Qxe4+');
  assert.equal(qh4Result.proof.settledRecoveryResidual, -10);
  assert.equal(qh4Result.decision.sacrifice, false, 'first-ranked move still cannot get credit for an equal trade');
  const b5 = fixtureMove('FixturePlayer001 vs FixturePlayer011', 12);
  assert.equal(decide(b5, 'c3d4').proof.settledRecoveryResidual, -10, 'bxc4 restores the knight value');
  assert.equal(decide(b5, 'c3d4').decision.sacrifice, false);
  const h4 = fixtureMove('FixturePlayer001 vs FixturePlayer018', 21);
  const h4Result = decide(h4, 'h6g5');
  assert.equal(h4Result.proof.settledRecoveryResidual, 230,
    'poisoned Qxf6 is recaptured; sound hxg5 leaves a bishop-for-pawn deficit');
  assert.ok(h4Result.proof.settledRecoveryNodes > 0);
  assert.ok(h4Result.proof.settledRecoveryNodes <= 256);
  assert.equal(h4Result.decision.sacrifice, true);
  const nxd5 = fixtureMove('Either-way 7...Nxd5', 14);
  assert.equal(policy.offer(nxd5, {}, '').candidates.find(candidate => candidate.uci === 'c3d4')?.requiresSettledDeficit,
    false, 'the optional 7...Nxd5 follows the prior-own-turn offer path');
});

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
  const declined = fixtureMove('FixturePlayer001 vs FixturePlayer011', 44);
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
  const context = fixtureMove('FixturePlayer001 vs FixturePlayer011', 44);
  const accepted = new Chess(context.afterFen); accepted.move('Bxb4');
  const acceptedFen = accepted.fen();
  const calls = [], responses = [];
  const legal = (fen, pv) => { const board = new Chess(fen); return pv.every(uci => !!board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })); };
  const engine = { capabilities: { multiPv: true, rootMoves: true }, async search(request) {
    calls.push(request);
    let roots, values;
    if (request.fen === context.priorFen) {
      roots = new Chess(request.fen).moves({ verbose: true }).map(move => move.lan).slice(0, 3);
      values = [0, -10, -20];
    } else if (request.fen === context.beforeFen) {
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
  const base = fixtureMove('Owner game B 22.Re1 offer', 43);
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

test('non-first Brilliant needs an admitted same-depth best-versus-played pair', () => {
  const base = fixtureMove('Owner game B 22.Re1 offer', 43);
  const state = policy.offer(base, {}, '');
  const proof = policy.verify(base, state, [{ depth: 10, scoreCp: -100, mate: null, pv: ['b6c5'] }]);
  assert.ok(proof.qualifyingMaterialOffer >= 120);
  const line = (uci, cp, depth = 15, multipv = 1) => ({ multipv, depth, scoreCp: cp, mate: null, pv: [uci] });
  const best = line('f4f2', 50), played = line(base.move.uci, 40, 15, 2);
  const context = { ...base,
    beforeAnalysis: { ...best, bestmove: best.pv[0], depth: 15, candidates: [best, played] },
    afterAnalysis: { depth: 15, scoreCp: -40, mate: null, candidates: [], sacrificeVerification: proof } };
  const request = policy.prepared.brilliantComparison(context);
  assert.deepEqual(request, { fen: base.beforeFen, depth: 15, multiPv: 2, rootMoves: ['f4f2', base.move.uci] });
  assert.equal(policy.classify(context).sacrifice, false, 'a generic root score cannot substitute for the pair proof');
  const pair = { ...best, bestmove: best.pv[0], candidates: [best, played] };
  context.comparisonAnalysis = policy.prepared.admitClassificationComparison(context, request, pair);
  assert.ok(context.comparisonAnalysis);
  assert.equal(policy.prepared.brilliantComparison(context), null, 'an exact admitted pair is reused');
  assert.equal(policy.classify(context).sacrifice, true);
  const promoted = line(base.move.uci, 50), other = line('f4f2', 40, 15, 2);
  const pairBestPlayed = { ...promoted, bestmove: base.move.uci, candidates: [promoted, other] };
  const pairedPromotion = { ...context,
    comparisonAnalysis: policy.prepared.admitClassificationComparison(context, request, pairBestPlayed) };
  assert.equal(policy.classify(pairedPromotion).sacrifice, true);
  assert.equal(policy.classify(pairedPromotion).playedBest, false,
    'restricted pair ranking cannot turn original unrestricted rank two into Best');
  assert.equal(policy.classify(pairedPromotion).comparisonSource, 'brilliant-pair');
  assert.equal(policy.classify(pairedPromotion).comparisonBestmove, base.move.uci,
    'pair-local best is identified separately from the unrestricted best in beforeAnalysis');

  const stale = { ...context, comparisonAnalysis: { ...pair, depth: 14, candidates: pair.candidates.map(line => ({ ...line, depth: 14 })) } };
  assert.deepEqual(policy.prepared.brilliantComparison(stale), request);
  assert.equal(policy.classify(stale).sacrifice, false);
  const partial = { ...context, comparisonAnalysis: { ...pair, candidates: [best] } };
  assert.deepEqual(policy.prepared.brilliantComparison(partial), request);
  assert.equal(policy.classify(partial).sacrifice, false);
  const wrongRoot = { ...context, comparisonAnalysis: { ...pair, candidates: [best, line('a2a3', 40, 15, 2)] } };
  assert.deepEqual(policy.prepared.brilliantComparison(wrongRoot), request);
  assert.equal(policy.classify(wrongRoot).sacrifice, false);
  const losing = { ...context, comparisonAnalysis: policy.prepared.admitClassificationComparison(context, request,
    { ...best, bestmove: best.pv[0], candidates: [best, line(base.move.uci, -250, 15, 2)] }) };
  assert.equal(policy.prepared.brilliantComparison(losing), null, 'a complete refuting pair needs no further search');
  assert.equal(policy.classify(losing).sacrifice, false);
  const rankOne = { ...context, beforeAnalysis: { ...played, bestmove: base.move.uci,
    candidates: [line(base.move.uci, 40), line('f4f2', 30, 15, 2)] }, comparisonAnalysis: undefined };
  assert.equal(policy.prepared.brilliantComparison(rankOne), null);
  assert.equal(policy.classify(rankOne).sacrifice, true);
});

test('service searches a non-first otherwise Brilliant pair once after acceptance proof', async () => {
  const context = fixtureMove('Owner game B 22.Re1 offer', 43), calls = [], results = [];
  const engine = { capabilities: { multiPv: true, rootMoves: true }, async search(request) {
    calls.push(request);
    let roots, scores;
    if (request.fen === context.beforeFen) {
      roots = request.rootMoves || ['f4f2', context.move.uci, 'b3c2'];
      scores = roots.map(uci => uci === 'f4f2' ? 50 : uci === context.move.uci ? 40 : 0);
    } else if (request.fen === context.afterFen && request.rootMoves) {
      roots = request.rootMoves; scores = roots.map(() => -100);
    } else {
      roots = new Chess(request.fen).moves({ verbose: true }).slice(0, request.multiPv).map(move => move.lan);
      scores = roots.map(() => request.fen === context.afterFen ? -40 : 0);
    }
    const candidates = roots.map((uci, index) => ({ multipv: index + 1, depth: request.depth, scoreCp: scores[index], mate: null, pv: [uci] }));
    const result = { ...candidates[0], bestmove: roots[0], candidates };
    results.push({ request, result });
    return result;
  } };
  const service = createAnalysisService(policy, engine, undefined, { legalPv: (fen, pv) => {
    const board = new Chess(fen); return pv.every(uci => !!board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }));
  } });
  const result = await service.analyzeAndClassify({ context, depth: 15 });
  assert.equal(result.status, 'complete');
  assert.equal(result.decision.classification, 'brilliant');
  const pairs = calls.filter(request => request.fen === context.beforeFen && request.rootMoves);
  assert.deepEqual(pairs.map(request => request.rootMoves), [['f4f2', context.move.uci]]);
  assert.equal(pairs[0].depth, 15);
  const again = await service.analyzeAndClassify({ context, depth: 15 });
  assert.equal(again.status, 'complete');
  assert.equal(calls.filter(request => request.fen === context.beforeFen && request.rootMoves).length, 1,
    'the admitted exact pair is reused for the same occurrence and evidence epoch');
  const supplied = [...new Map(results.filter(item => item.request.fen !== context.beforeFen || !item.request.rootMoves)
    .map(item => [JSON.stringify([item.request.fen, item.request.rootMoves || null]), item])).values()]
    .map(item => ({ kind: 'live-position', fen: item.request.fen,
      ...(item.request.rootMoves ? { rootMoves: item.request.rootMoves } : {}), analysis: item.result }));
  const suppliedService = createAnalysisService(policy, undefined);
  const missing = await suppliedService.analyzeAndClassify({ context, depth: 15, suppliedOnly: true, evidence: supplied });
  assert.equal(missing.status, 'complete');
  assert.equal(missing.decision.sacrifice, false, 'missing optional pair keeps the ordinary classification available');
  const pair = results.find(item => item.request.fen === context.beforeFen && item.request.rootMoves);
  supplied.push({ kind: 'live-position', fen: pair.request.fen, rootMoves: pair.request.rootMoves, analysis: pair.result });
  const complete = await suppliedService.analyzeAndClassify({ context, depth: 15, suppliedOnly: true, evidence: supplied });
  assert.equal(complete.status, 'complete');
  assert.equal(complete.decision.classification, 'brilliant');
  const conflictCalls = [];
  const conflictEngine = { capabilities: engine.capabilities, async search(request) {
    conflictCalls.push(request);
    const result = await engine.search(request);
    if (request.fen !== context.afterFen || request.rootMoves) return result;
    const candidates = result.candidates.map(line => ({ ...line, scoreCp: -500 }));
    return { ...candidates[0], bestmove: candidates[0].pv[0], candidates };
  } };
  const reconciled = await createAnalysisService(policy, conflictEngine).analyzeAndClassify({ context, depth: 15 });
  assert.equal(reconciled.status, 'complete');
  assert.equal(reconciled.decision.classification, 'brilliant');
  const restrictedBefore = conflictCalls.filter(request => request.fen === context.beforeFen && request.rootMoves);
  assert.equal(restrictedBefore.length, 2, 'ordinary three-root reconciliation and selective pair have separate stages');
  assert.equal(restrictedBefore[0].rootMoves.length, 3);
  assert.deepEqual(restrictedBefore[1].rootMoves, ['f4f2', context.move.uci]);
  assert.equal(restrictedBefore[1].depth, restrictedBefore[0].depth,
    'selective pair does not override a deeper ordinary comparison with shallow evidence');
  const demotingEngine = { capabilities: engine.capabilities, async search(request) {
    const result = await conflictEngine.search(request);
    if (request.fen !== context.beforeFen || request.rootMoves?.length !== 2) return result;
    const candidates = result.candidates.map(line => ({ ...line,
      scoreCp: line.pv[0] === 'f4f2' ? 500 : 0 }));
    return { ...candidates[0], bestmove: candidates[0].pv[0], candidates };
  } };
  const demoted = await createAnalysisService(policy, demotingEngine).analyzeAndClassify({ context, depth: 15 });
  assert.equal(demoted.status, 'complete');
  assert.equal(demoted.decision.sacrifice, false, 'the later exact pair can refute an earlier generic Brilliant');
  assert.equal(demoted.decision.comparisonSource, 'brilliant-pair');
  assert.equal(demoted.decision.comparisonBestmove, 'f4f2');
  assert.equal(demoted.decision.playedBest, false);
  assert.ok(demoted.decision.qualityLoss > .025, 'ordinary final quality is computed from the pair scores');
  assert.notEqual(demoted.decision.classification, 'brilliant');
  const shortCalls = [];
  const shortEngine = { capabilities: engine.capabilities, async search(request) {
    shortCalls.push(request);
    const result = await engine.search(request);
    if (request.fen !== context.beforeFen || !request.rootMoves) return result;
    const candidates = result.candidates.map(line => ({ ...line, depth: request.depth - 1 }));
    return { ...candidates[0], depth: request.depth - 1, bestmove: candidates[0].pv[0], candidates };
  } };
  const shortService = createAnalysisService(policy, shortEngine);
  for (let repeat = 0; repeat < 2; repeat++) {
    const outcome = await shortService.analyzeAndClassify({ context, depth: 15 });
    assert.equal(outcome.status, 'complete');
    assert.equal(outcome.decision.sacrifice, false);
  }
  assert.equal(shortCalls.filter(request => request.fen === context.beforeFen && request.rootMoves).length, 1,
    'an under-depth pair fails closed without a new search loop');
  for (const mode of ['cancel', 'epoch']) {
    let epoch = 0, started, release, paused = true, pairSearches = 0;
    const atPair = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const gatedEngine = { capabilities: engine.capabilities, async search(request) {
      if (request.fen === context.beforeFen && request.rootMoves) {
        pairSearches++;
        if (paused) { started(); await gate; paused = false; }
      }
      return engine.search(request);
    } };
    const gatedService = createAnalysisService(policy, gatedEngine,
      { get: () => null, put: () => {}, generation: () => epoch });
    const controller = new AbortController();
    const pending = gatedService.analyzeAndClassify({ context, depth: 15, signal: controller.signal });
    await atPair;
    if (mode === 'cancel') controller.abort(); else epoch++;
    release();
    const expired = await pending;
    assert.equal(expired.status, 'unavailable');
    assert.equal(expired.reason, 'cancelled');
    const retried = await gatedService.analyzeAndClassify({ context, depth: 15 });
    assert.equal(retried.status, 'complete');
    assert.equal(retried.decision.classification, 'brilliant');
    assert.equal(pairSearches, 2, `${mode} must not retain an in-flight pair attempt marker`);
  }
});

test('explicit selected verification is scoped to one native classification call', () => {
  const native = createKnightsEyePolicyRuntime(Chess);
  const context = fixtureMove('Owner game B 22.Re1 offer', 43);
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
