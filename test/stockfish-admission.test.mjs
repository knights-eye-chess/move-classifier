import assert from 'node:assert/strict';
import test from 'node:test';
import { createStockfishAdapter } from '@knights-eye-chess/move-classifier/engine/stockfish';

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
function harness(request = { fen, depth: 8, multiPv: 1 }) {
  const commands = [];
  let receive, terminated = 0;
  const adapter = createStockfishAdapter((_label, onData) => {
    receive = onData;
    return { postMessage: command => commands.push(command), terminate: () => { terminated++; } };
  }, 1000, 'test-build');
  const pending = adapter.search(request);
  for (const line of ['frame-ready', 'uciok', 'readyok']) receive(line);
  return { pending, receive, commands, get terminated() { return terminated; } };
}

test('complete scored MultiPV roots retain score, mate-in-moves and root provenance', async () => {
  const h = harness({ fen, depth: 8, multiPv: 2, rootMoves: ['e2e4', 'd2d4'] });
  h.receive('info depth 8 multipv 1 score cp 0 pv e2e4 e7e5');
  h.receive('info depth 9 multipv 2 score mate -3 pv d2d4 d7d5');
  h.receive('bestmove e2e4 ponder e7e5');
  const result = await h.pending;
  assert.equal(result.bestmove, 'e2e4');
  assert.equal(result.depth, 8);
  assert.deepEqual(result.candidates.map(line => [line.scoreCp, line.mate]), [[0, null], [null, -3]]);
  assert.deepEqual(result.candidates[1].scoreProvenance, { kind: 'root-search', fen,
    originatingDepth: 9, reportedDepth: 9, engineBuild: 'test-build' });
  assert(h.commands.includes('go depth 8 searchmoves e2e4 d2d4'));
  assert.equal(h.terminated, 1);
});

test('missing, nonnumeric, conflicting and bound scores cannot complete a search', async () => {
  for (const score of ['', 'score cp NaN', 'score cp 1.5', 'score cp 12 score mate 2', 'score cp 12 lowerbound']) {
    const h = harness();
    h.receive(`info depth 8 multipv 1 ${score} pv e2e4 e7e5`);
    h.receive('bestmove e2e4');
    await assert.rejects(h.pending, /did not complete/);
    assert.equal(h.terminated, 1);
  }
});

test('empty and malformed UCI PVs cannot produce a best move', async () => {
  for (const pv of ['', 'none', 'e2e4 e7e9', 'e2e4 e7e5q']) {
    const h = harness();
    h.receive(`info depth 8 multipv 1 score cp 12 pv ${pv}`);
    h.receive('bestmove e2e4');
    await assert.rejects(h.pending, /did not complete/);
    assert.equal(h.terminated, 1);
  }
});

test('partial depth, MultiPV coverage, roots and bestmove mismatches reject', async () => {
  for (const lines of [
    ['info depth 7 multipv 1 score cp 12 pv e2e4', 'bestmove e2e4'],
    ['info depth 8 multipv 1 score cp 12 pv e2e4', 'bestmove e2e4'],
    ['info depth 8 multipv 1 score cp 12 pv e2e4', 'info depth 8 multipv 2 score cp 10 pv e2e4', 'bestmove e2e4'],
    ['info depth 8 multipv 1 score cp 12 pv e2e4', 'info depth 8 multipv 2 score cp 10 pv g1f3', 'bestmove e2e4'],
    ['info depth 8 multipv 1 score cp 12 pv e2e4', 'info depth 8 multipv 2 score cp 10 pv d2d4', 'bestmove d2d4'],
  ]) {
    const single = lines.length === 2 && lines[0].includes('depth 7');
    const h = harness({ fen, depth: 8, multiPv: single ? 1 : 2, rootMoves: single ? [] : ['e2e4', 'd2d4'] });
    for (const line of lines) h.receive(line);
    await assert.rejects(h.pending, /did not complete/);
    assert.equal(h.terminated, 1);
  }
});

test('invalid requests and cancellation do not leave an active port', async () => {
  let acquired = 0;
  const adapter = createStockfishAdapter(() => { acquired++; throw new Error('should not acquire'); });
  for (const request of [
    { fen, depth: 0 }, { fen, depth: 8, multiPv: 0 },
    { fen, depth: 8, multiPv: 2, rootMoves: ['e2e4'] },
    { fen, depth: 8, multiPv: 2, rootMoves: ['e2e4', 'e2e4'] },
  ]) await assert.rejects(adapter.search(request), /Invalid Stockfish/);
  assert.equal(acquired, 0);
  const controller = new AbortController();
  const h = harness({ fen, depth: 8, signal: controller.signal });
  controller.abort();
  await assert.rejects(h.pending, /cancelled/);
  h.receive('bestmove e2e4');
  assert.equal(h.terminated, 1);
});

test('synchronous transport output settles and closes its returned port', async () => {
  let terminated = 0;
  const adapter = createStockfishAdapter((_label, receive) => {
    receive('engineerror unavailable');
    return { postMessage() { throw new Error('closed'); }, terminate() { terminated++; } };
  });
  await assert.rejects(adapter.search({ fen, depth: 8 }), /unavailable/);
  assert.equal(terminated, 1);
});

