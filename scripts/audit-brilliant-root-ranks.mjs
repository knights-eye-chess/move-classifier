import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { Chess } from 'chess.js';

// The static-offer roots whose attribution changed in policy-46 exploration.
// This audits ranking independently of sacrifice verification and labels.
const targets = [
  ['FixturePlayer001 vs FixturePlayer018', 21],
  ['FixturePlayer018 8...h6 alternative', 16],
  ['FixturePlayer001 vs FixturePlayer011', 12],
  ['FixturePlayer002 vs FixturePlayer003', 16],
  ['FixturePlayer010 vs FixturePlayer001 through 13...O-O-O', 12],
  ['FixturePlayer010 vs FixturePlayer001 through 13...O-O-O', 17],
  ['FixturePlayer001 vs FixturePlayer008 partial-recovery conversion', 36],
  ['FixturePlayer021 vs FixturePlayer002', 16],
  ['FixturePlayer022 vs FixturePlayer002', 30],
  ['Owner game B 22.Re1 offer', 12],
  ['Owner game B 22.Re1 offer', 22],
  ['Owner game B 22.Re1 offer', 45],
  ['Either-way 7...Nxd5', 12],
];
const data = JSON.parse(readFileSync(new URL('../tests/fixtures/brilliant-corpus.json', import.meta.url)));
const all = [...data.fixtures, ...data.interestingFixtures, ...data.addedFixtures, data.nc5SingleMoveFixture];
const requiredTargets = all.flatMap(fixture => (fixture.expected || []).map(key => [fixture.name, Number(key.split(':')[0])]));
const enginePath = process.env.KE_RANK_ENGINE;
const depth = Number(process.env.KE_RANK_DEPTH || 22);
const movetime = Number(process.env.KE_RANK_MOVETIME_MS || 3000);
assert.ok(enginePath && Number.isSafeInteger(depth) && depth > 0 && Number.isSafeInteger(movetime) && movetime > 0);
const selectedTargets = (process.env.KE_RANK_REQUIRED ? requiredTargets : targets).filter(([name, ply]) =>
  (!process.env.KE_RANK_FIXTURE || name === process.env.KE_RANK_FIXTURE) &&
  (!process.env.KE_RANK_PLY || ply === Number(process.env.KE_RANK_PLY)));
assert.ok(selectedTargets.length, 'No rank-audit targets matched the selected fixture and ply');
const proc = spawn(process.execPath, [enginePath], { stdio: ['pipe', 'pipe', 'pipe'] });
let stderr = '', failure = null, waiter = null, pending = [];
proc.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-4000); });
proc.on('error', error => { failure = error; waiter?.reject(error); });
proc.on('exit', code => { failure = new Error(`Engine exited ${code}: ${stderr}`); waiter?.reject(failure); });
readline.createInterface({ input: proc.stdout }).on('line', line => {
  pending.push(line);
  if (waiter && waiter.accept(line)) {
    const current = waiter; waiter = null; clearTimeout(current.timer);
    current.resolve(pending.splice(0));
  }
});
const send = command => proc.stdin.write(`${command}\n`);
const wait = accept => new Promise((resolve, reject) => {
  if (failure) { reject(failure); return; }
  assert.equal(waiter, null);
  const timer = setTimeout(() => { waiter = null; reject(new Error(`Engine timeout: ${stderr}`)); }, movetime + 20000);
  waiter = { accept, resolve, reject, timer };
});
function scored(lines) {
  const found = new Map();
  for (const line of lines) {
    if (!line.startsWith('info ') || !line.includes(' pv ')) continue;
    const match = /\bdepth (\d+).*\bmultipv (\d+).*\bscore (cp|mate) (-?\d+).*\bpv (.+)/.exec(line);
    if (!match) continue;
    const [, achieved, multipv, kind, score, pv] = match, rank = Number(multipv);
    if (!found.has(rank) || found.get(rank).depth <= Number(achieved))
      found.set(rank, { rank, depth: Number(achieved), scoreCp: kind === 'cp' ? Number(score) : null,
        mate: kind === 'mate' ? Number(score) : null, uci: pv.split(' ')[0] });
  }
  return [...found.values()].sort((a, b) => a.rank - b.rank);
}
function expectedPoints(line) {
  if (!line) return null;
  if (line.mate != null) return line.mate > 0 ? 1 : 0;
  return line.scoreCp == null ? null : 1 / (1 + Math.exp(-line.scoreCp / 420));
}
async function search(fen, roots = []) {
  send(`setoption name MultiPV value ${roots.length || 3}`);
  send(`position fen ${fen}`);
  send(`go depth ${depth} movetime ${movetime}${roots.length ? ` searchmoves ${roots.join(' ')}` : ''}`);
  const lines = await wait(line => line.startsWith('bestmove '));
  return { bestmove: lines.at(-1).split(' ')[1], candidates: scored(lines) };
}
try {
  send('uci');
  const identity = await wait(line => line === 'uciok');
  send('setoption name Threads value 1');
  send('setoption name Hash value 16');
  send('isready'); await wait(line => line === 'readyok');
  console.log(JSON.stringify({ engine: identity.find(line => line.startsWith('id name '))?.slice(8), depth, movetime, targets: selectedTargets.length }));
  const cache = new Map();
  for (const [name, ply] of selectedTargets) {
    const fixture = all.find(item => item.name === name);
    assert.ok(fixture, name);
    const game = new Chess(); game.loadPgn(fixture.pgn);
    const moves = game.history({ verbose: true }), board = new Chess(game.header().FEN || undefined);
    for (let i = 0; i < ply - 1; i++) board.move(moves[i].lan);
    const fen = board.fen(), move = moves[ply - 1], key = `${fen}|${move.lan}`;
    if (!cache.has(key)) {
      send('ucinewgame'); send('setoption name Clear Hash'); send('isready'); await wait(line => line === 'readyok');
      const root = await search(fen), first = root.candidates[0], played = root.candidates.find(line => line.uci === move.lan);
      const alternative = root.candidates.find(line => line.uci !== move.lan) || null;
      let pair = null;
      if ((process.env.KE_RANK_PAIR || !played) && alternative)
        pair = await search(fen, [alternative.uci, move.lan]);
      const afterBoard = new Chess(fen); afterBoard.move(move.lan);
      const child = process.env.KE_RANK_AFTER ? await search(afterBoard.fen()) : null;
      const childBest = child?.candidates[0] || null;
      cache.set(key, { bestmove: root.bestmove, candidates: root.candidates, alternative,
        bestEp: expectedPoints(first), alternativeEp: expectedPoints(alternative),
        childBest, playedMateOnly: !!alternative && !!(played?.mate > 0 || played?.mate == null && childBest?.mate < 0) && !(alternative.mate > 0),
        playedRank: played?.rank || '>MultiPV',
        marginCp: played && first?.scoreCp != null && played.scoreCp != null ? first.scoreCp - played.scoreCp : null,
        pairwise: pair && { roots: [alternative.uci, move.lan], candidates: pair.candidates,
          marginCp: pair.candidates.length === 2 && pair.candidates.every(line => line.scoreCp != null)
            ? (pair.candidates.find(line => line.uci === alternative.uci)?.scoreCp ?? 0) -
              (pair.candidates.find(line => line.uci === move.lan)?.scoreCp ?? 0) : null } });
    }
    console.log(JSON.stringify({ fixture: name, ply, san: move.san, uci: move.lan, fen, ...cache.get(key) }));
  }
} finally { send('quit'); }
