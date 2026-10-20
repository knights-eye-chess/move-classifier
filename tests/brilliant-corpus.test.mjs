import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import {Stockfish} from './helpers/corpus-engine.mjs';
import { Chess } from 'chess.js';
import { createKnightsEyePolicy } from '@knights-eye-chess/move-classifier/policy/knights-eye';

// Set KE_CORPUS_ENGINE to an actual Stockfish JS entry point. The default
// package check remains engine-independent; the release gate runs this corpus
// under every supported engine and depth.
const enginePath = process.env.KE_CORPUS_ENGINE;
const depth = Number(process.env.KE_CORPUS_DEPTH || 15);
const fixtureData = JSON.parse(readFileSync(new URL('./fixtures/brilliant-corpus.json', import.meta.url)));
// Qualified configuration and artifact hashes: docs/research/corpus-acquisition-budget.md.
const engineBudget = { ...fixtureData.engineBudget, mode: process.env.KE_CORPUS_BUDGET_MODE || 'nodes-admit',
  nodeLimit: process.env.KE_CORPUS_NODE_LIMIT ? Number(process.env.KE_CORPUS_NODE_LIMIT) : 2000000 };



function replay(pgn) {
  const game = new Chess(); game.loadPgn(pgn);
  const moves = game.history({ verbose: true });
  const board = new Chess(game.header().FEN || undefined);
  const fens = [board.fen()], played = [];
  for (const move of moves) {
    played.push(board.move(move.lan));
    fens.push(board.fen());
  }
  return { fens, moves: played };
}

async function classifyFixture(fixture, engine, cache) {
  const policy = createKnightsEyePolicy(Chess);
  const { fens, moves } = replay(fixture.pgn);
  const sets = { brilliant: [], interesting: [], great: [] };
  const diagnostics = [];
  let continuationSearches = 0, continuationRoots = 0, continuationMs = 0;
  let brilliantPairSearches = 0, brilliantPairMs = 0;
  let previousExchange = null;
  const position = async fen => {
    const terminal = policy.terminal(fen, depth);
    if (terminal) return terminal;
    if (!cache.has(fen)) cache.set(fen, engine.analyze(fen, depth));
    return cache.get(fen);
  };
  for (let index = 0; index < moves.length; index++) {
    const move = { ...moves[index], uci: moves[index].lan };
    const beforeFen = fens[index], afterFen = fens[index + 1];
    if (process.env.KE_CORPUS_TRACE_PLY) console.log(`[real policy ply ${index + 1}/${moves.length}] ${move.san}`);
    const exchange = policy.materialExchangeForMove(move, beforeFen, previousExchange);
    const context = {
      move, previousMove: index ? { ...moves[index - 1], uci: moves[index - 1].lan } : null,
      previousMaterialExchange: previousExchange, beforeFen, afterFen,
      priorFen: index >= 1 ? fens[index - 1] : '',
      priorOwnBeforeFen: index >= 2 ? fens[index - 2] : '',
      beforeAnalysis: await position(beforeFen), afterAnalysis: await position(afterFen),
      priorEp: index ? policy.priorPoints(await position(fens[index - 1])) : null,
      book: false,
    };
    previousExchange = exchange;
    const state = policy.offer(context, context.afterAnalysis, exchange.inherited ? exchange.originFen : '');
    if (state.candidates.length) {
      const roots = state.candidates.map(candidate => candidate.uci);
      const verified = await engine.analyze(afterFen, 10, roots, true);
      engine.searches.at(-1).gate = 'verification';
      let proof = verified.depth >= 10 ? policy.verify(context, state, verified.candidates) : null;
      if (proof) {
        const scopes = policy.continuationRequests(context, state, proof);
        const evidence = [];
        for (const request of scopes) {
          continuationSearches++;
          continuationRoots += request.rootMoves.length;
          const started = performance.now();
          const analysis = await engine.analyze(request.fen, request.depth, request.rootMoves, true);
          engine.searches.at(-1).gate = 'continuation';
          continuationMs += performance.now() - started;
          evidence.push({ request, analysis });
        }
        if (scopes.length) proof = policy.verifyContinuations(context, state, proof, evidence);
      }
      if (proof) context.afterAnalysis = { ...context.afterAnalysis, sacrificeVerification: proof };
    }
    const pairRequest = policy.brilliantComparison(context);
    if (pairRequest) {
      brilliantPairSearches++;
      const started = performance.now();
      const comparison = await engine.analyze(pairRequest.fen, pairRequest.depth, pairRequest.rootMoves, true);
      engine.searches.at(-1).gate = 'comparison';
      brilliantPairMs += performance.now() - started;
      if (comparison.depth >= pairRequest.depth) {
        const admitted = policy.admitClassificationComparison(context, pairRequest, comparison);
        if (admitted) context.comparisonAnalysis = admitted;
      }
    }
    const decision = policy.classify(context);
    const keyForUse = `${index + 1}:${move.san}`;
    const expectedSpecial = [...(fixture.expected || []), ...(fixture.expectedInteresting || []),
      ...(fixture.optionalBrilliant || []), ...(fixture.optionalInteresting || []),
      ...(fixture.expectedSpecialVariants || []).flatMap(v => [...(v.brilliant || []), ...(v.interesting || [])])].includes(keyForUse);
    for (const receipt of engine.searches) {
      if (![beforeFen, afterFen, context.priorFen, context.priorOwnBeforeFen].includes(receipt.fen)) continue;
      (receipt.policyUses ||= []).push({move:keyForUse,label:decision.classification,expectedSpecial});
    }
    const key = `${index + 1}:${move.san}`;
    if (sets[decision.classification]) sets[decision.classification].push(key);
    if (decision.sacrifice || state.candidates.length) {
      const lines = context.beforeAnalysis.candidates || [];
      const best = lines.find(line => line.pv?.[0] === context.beforeAnalysis.bestmove);
      const playedLine = lines.find(line => line.pv?.[0] === move.uci);
      diagnostics.push({ key, label: decision.classification,
        offers: state.candidates.map(candidate => ({ uci: candidate.uci, mode: candidate.offerMode,
          requiresSettledDeficit: candidate.requiresSettledDeficit,
          settledRecoveryResidual: candidate.settledRecoveryResidual,
          settledRecoveryNodes: candidate.settledRecoveryNodes,
          settledRecoveryOverBudget: candidate.settledRecoveryOverBudget })),
        accepted: decision.sacrificeVerification?.acceptedMove,
        bestmove: context.beforeAnalysis.bestmove,
        playedRank: playedLine ? lines.indexOf(playedLine) + 1 : '>MultiPV',
        marginCp: typeof best?.scoreCp === 'number' && typeof playedLine?.scoreCp === 'number'
          ? best.scoreCp - playedLine.scoreCp : null,
        bestCp: best?.scoreCp ?? null, playedCp: playedLine?.scoreCp ?? null,
        ep: decision.afterEp, qualityLoss: decision.qualityLoss });
    }
  }
  return { sets, diagnostics, continuationSearches, continuationRoots, continuationMs, brilliantPairSearches, brilliantPairMs };
}

const fixtures = [...fixtureData.fixtures, ...fixtureData.interestingFixtures, ...fixtureData.addedFixtures, fixtureData.nc5SingleMoveFixture];
test('KE-AN-009: real policy reproduces complete reviewed Brilliant and Interesting sets', { skip: !enginePath, timeout: 3600000 }, async () => {
  const differences = [], fixtureResults = [], searches = [];
  let engineName;
  console.log(`[engine budget] ${JSON.stringify({ requestedDepth: depth, ...engineBudget })}`);
  const startIndex = Number(process.env.KE_CORPUS_START || 1);
  const endIndex = Number(process.env.KE_CORPUS_END || fixtures.length);
  const selected = fixtures.filter((fixture, index) => index + 1 >= startIndex && index + 1 <= endIndex &&
    (!process.env.KE_CORPUS_FIXTURE || fixture.name.includes(process.env.KE_CORPUS_FIXTURE)));
  assert.ok(selected.length, 'No corpus fixtures matched the selected range or KE_CORPUS_FIXTURE');
  try {
    for (const [index, fixture] of selected.entries()) {
      console.log(`[real policy ${index + 1}/${selected.length}] ${fixture.name}`);
      // Independent corpus PGNs must not inherit results or hash state from
      // fixture order. The browser can reuse a warm engine session across jobs;
      // this isolated profile controls that source of test variation.
      const engine = new Stockfish(enginePath, engineBudget);
      engine.fixtureName = fixture.name;
      try {
        await engine.init();
        engineName = engine.engineName;
        await engine.newGame();
        const result = await classifyFixture(fixture, engine, new Map());
        console.log(`[fixture labels] ${JSON.stringify({ fixture: fixture.name, sets: result.sets, diagnostics: result.diagnostics })}`);
        if (result.continuationSearches) console.log(`[continuations] ${fixture.name}: ${result.continuationSearches} searches, ${result.continuationRoots} roots, ${Math.round(result.continuationMs)} ms`);
        if (result.brilliantPairSearches) console.log(`[brilliant pairs] ${fixture.name}: ${result.brilliantPairSearches} searches, ${Math.round(result.brilliantPairMs)} ms`);
        const variants = fixture.expectedSpecialVariants || [{ brilliant: fixture.expected || [], interesting: fixture.expectedInteresting || [] }];
        const actual = { brilliant: result.sets.brilliant, interesting: result.sets.interesting };
        fixtureResults.push({fixture:fixture.name,actual});
        const compare = fixture.brilliantOnly || fixture.name.startsWith('Owner game ') || fixture.name.startsWith('Either-way ')
          ? value => ({ brilliant: value.brilliant }) : value => value;
        const allowedOptional = fixture.optionalBrilliant || [];
        const allowedInteresting = fixture.optionalInteresting || [];
        const matchesVariant = variant => {
          const required = compare(variant), observed = compare(actual);
          const allowed = new Set([...(required.brilliant || []), ...allowedOptional]);
          const interesting = new Set([...(required.interesting || []), ...allowedInteresting]);
          return (required.brilliant || []).every(key => observed.brilliant.includes(key)) &&
            observed.brilliant.every(key => allowed.has(key)) &&
            (required.interesting === undefined ||
              ((required.interesting || []).every(key => observed.interesting.includes(key)) &&
                observed.interesting.every(key => interesting.has(key))));
        };
        if (!variants.some(matchesVariant)) differences.push({ fixture: fixture.name, expected: variants, optionalBrilliant: allowedOptional, actual, diagnostics: result.diagnostics });
        for (const forbidden of fixture.forbiddenBrilliant || []) if (actual.brilliant.includes(forbidden)) differences.push({ fixture: fixture.name, forbidden, actual });
      } catch (error) {
        const failure = {fixture:fixture.name,failed:true,reason:error.message};
        fixtureResults.push(failure); differences.push(failure);
      } finally {
        searches.push(...engine.searches); engine.close();
      }
    }
    assert.deepEqual(differences, []);
  } finally {
    const underDepth = searches.filter(search => search.achievedDepth < search.requestedDepth);
    console.log(`[engine searches] ${JSON.stringify({ total: searches.length, restricted: searches.filter(search => search.restricted).length,
      underDepth: underDepth.length, failed:searches.filter(search=>search.failed).length, slowestMs: Math.max(0, ...searches.map(search => search.elapsedMs)),
      slowestFen: searches.toSorted((a, b) => b.elapsedMs - a.elapsedMs)[0]?.fen || '' })}`);
    if (process.env.KE_CORPUS_SEARCH_RECORD) writeFileSync(process.env.KE_CORPUS_SEARCH_RECORD, JSON.stringify({engineName,budget:engineBudget,fixtureResults,differences,searches},null,2));
  }
});
