import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { Chess } from 'chess.js';
import { createKnightsEyePolicy } from '@knights-eye-chess/move-classifier/policy/knights-eye';

// Set KE_CORPUS_ENGINE to an actual Stockfish JS entry point. The default
// package check remains engine-independent; the release gate runs this corpus
// under every supported engine and depth.
const enginePath = process.env.KE_CORPUS_ENGINE;
const depth = Number(process.env.KE_CORPUS_DEPTH || 15);
const fixtureData = JSON.parse(readFileSync(new URL('./fixtures/brilliant-corpus.json', import.meta.url)));

class Stockfish {
  constructor(entry) {
    this.process = spawn(process.execPath, [entry], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.lines = readline.createInterface({ input: this.process.stdout });
    this.waiters = [];
    this.stderr = '';
    this.failure = null;
    this.lines.on('line', line => this.receive(line.trim()));
    this.process.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk).slice(-4000); });
    this.process.on('error', error => this.fail(error));
    this.process.on('exit', code => this.fail(new Error(`Stockfish exited ${code}: ${this.stderr}`)));
  }
  fail(error) {
    this.failure = error;
    for (const waiter of this.waiters.splice(0)) { clearTimeout(waiter.timer); waiter.reject(error); }
  }
  receive(line) {
    for (const waiter of [...this.waiters]) {
      waiter.lines.push(line);
      if (!waiter.accept(line)) continue;
      clearTimeout(waiter.timer);
      this.waiters.splice(this.waiters.indexOf(waiter), 1);
      waiter.resolve({ line, lines: waiter.lines });
      break;
    }
  }
  send(command) { this.process.stdin.write(`${command}\n`); }
  wait(accept) {
    return new Promise((resolve, reject) => {
      if (this.failure) { reject(this.failure); return; }
      const waiter = { accept, resolve, reject, lines: [], timer: null };
      waiter.timer = setTimeout(() => { this.waiters = this.waiters.filter(item => item !== waiter); reject(new Error('Stockfish search timed out')); }, 180000);
      this.waiters.push(waiter);
    });
  }
  async init() {
    this.send('uci'); await this.wait(line => line === 'uciok');
    this.send('isready'); await this.wait(line => line === 'readyok');
  }
  async analyze(fen, requestedDepth, roots = []) {
    this.send(`setoption name MultiPV value ${roots.length || 3}`);
    this.send(`position fen ${fen}`);
    this.send(`go depth ${requestedDepth}${roots.length ? ` searchmoves ${roots.join(' ')}` : ''}`);
    const received = await this.wait(line => line.startsWith('bestmove ')).catch(error => {
      throw new Error(`Stockfish search failed at depth ${requestedDepth}, FEN ${fen}, roots ${roots.join(' ')}: ${error.message}`, { cause: error });
    });
    const found = new Map();
    for (const line of received.lines) {
      if (!line.startsWith('info ') || !line.includes(' pv ')) continue;
      const match = /\bdepth (\d+).*\bmultipv (\d+).*\bscore (cp|mate) (-?\d+).*\bpv (.+)/.exec(line);
      if (!match) continue;
      const [, actualDepth, rank, kind, score, pv] = match;
      if (Number(actualDepth) !== requestedDepth) continue;
      found.set(Number(rank), { multipv: Number(rank), depth: Number(actualDepth), scoreCp: kind === 'cp' ? Number(score) : null, mate: kind === 'mate' ? Number(score) : null, pv: pv.trim().split(/\s+/) });
    }
    const candidates = [...found.values()].sort((a, b) => a.multipv - b.multipv);
    assert.ok(candidates.length, `Stockfish returned no depth-${requestedDepth} line for ${fen}`);
    return { ...candidates[0], bestmove: received.line.split(/\s+/)[1], candidates };
  }
  close() { this.send('quit'); }
}

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
      priorOwnBeforeFen: index >= 2 ? fens[index - 2] : '',
      beforeAnalysis: await position(beforeFen), afterAnalysis: await position(afterFen),
      priorEp: index ? policy.priorPoints(await position(fens[index - 1])) : null,
      book: false,
    };
    previousExchange = exchange;
    const state = policy.offer(context, context.afterAnalysis, exchange.inherited ? exchange.originFen : '');
    if (state.candidates.length) {
      const roots = state.candidates.map(candidate => candidate.uci);
      const verified = await engine.analyze(afterFen, 10, roots);
      let proof = policy.verify(context, state, verified.candidates);
      if (proof) {
        const scopes = policy.continuationRequests(context, state, proof);
        const evidence = [];
        for (const request of scopes) {
          continuationSearches++;
          continuationRoots += request.rootMoves.length;
          const started = performance.now();
          const analysis = await engine.analyze(request.fen, request.depth, request.rootMoves);
          continuationMs += performance.now() - started;
          evidence.push({ request, analysis });
        }
        if (scopes.length) proof = policy.verifyContinuations(context, state, proof, evidence);
      }
      if (proof) context.afterAnalysis = { ...context.afterAnalysis, sacrificeVerification: proof };
    }
    const decision = policy.classify(context);
    const key = `${index + 1}:${move.san}`;
    if (sets[decision.classification]) sets[decision.classification].push(key);
    if (decision.sacrifice || state.candidates.length) diagnostics.push({ key, label: decision.classification, offers: state.candidates.map(candidate => candidate.uci), accepted: decision.sacrificeVerification?.acceptedMove, ep: decision.afterEp, secondEp: decision.secondEp, qualityLoss: decision.qualityLoss });
  }
  return { sets, diagnostics, continuationSearches, continuationRoots, continuationMs };
}

const fixtures = [...fixtureData.fixtures, ...fixtureData.interestingFixtures, ...fixtureData.addedFixtures, fixtureData.nc5SingleMoveFixture];
test('KE-AN-009: real policy reproduces complete reviewed Brilliant and Interesting sets', { skip: !enginePath, timeout: 3600000 }, async () => {
  const engine = new Stockfish(enginePath), cache = new Map(), differences = [];
  const startIndex = Number(process.env.KE_CORPUS_START || 1);
  const selected = fixtures.filter((fixture, index) => index + 1 >= startIndex &&
    (!process.env.KE_CORPUS_FIXTURE || fixture.name.includes(process.env.KE_CORPUS_FIXTURE)));
  assert.ok(selected.length, 'No corpus fixtures matched KE_CORPUS_FIXTURE');
  await engine.init();
  try {
    for (const [index, fixture] of selected.entries()) {
      console.log(`[real policy ${index + 1}/${selected.length}] ${fixture.name}`);
      const result = await classifyFixture(fixture, engine, cache);
      if (result.continuationSearches) console.log(`[continuations] ${fixture.name}: ${result.continuationSearches} searches, ${result.continuationRoots} roots, ${Math.round(result.continuationMs)} ms`);
      const variants = fixture.expectedSpecialVariants || [{ brilliant: fixture.expected || [], interesting: fixture.expectedInteresting || [] }];
      const actual = { brilliant: result.sets.brilliant, interesting: result.sets.interesting };
      const compare = fixture.name.startsWith('Owner game ') || fixture.name.startsWith('Either-way ')
        ? value => ({ brilliant: value.brilliant }) : value => value;
      const allowedOptional = fixture.optionalBrilliant || [];
      const matchesVariant = variant => {
        const required = compare(variant), observed = compare(actual);
        const allowed = new Set([...(required.brilliant || []), ...allowedOptional]);
        return (required.brilliant || []).every(key => observed.brilliant.includes(key)) &&
          observed.brilliant.every(key => allowed.has(key)) &&
          (required.interesting === undefined || JSON.stringify(required.interesting) === JSON.stringify(observed.interesting));
      };
      if (!variants.some(matchesVariant)) differences.push({ fixture: fixture.name, expected: variants, optionalBrilliant: allowedOptional, actual, diagnostics: result.diagnostics });
      for (const forbidden of fixture.forbiddenBrilliant || []) if (actual.brilliant.includes(forbidden)) differences.push({ fixture: fixture.name, forbidden, actual });
    }
    assert.deepEqual(differences, []);
  } finally { engine.close(); }
});
