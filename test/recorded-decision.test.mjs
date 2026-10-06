import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RECORDED_DECISION_SCHEMA, readRecordedDecision, recordDecision,
} from '@knights-eye-chess/move-classifier/contracts';

const policy = { id: 'example/move-quality', revision: 40 };
const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const afterFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
function input() {
  return {
    schema: RECORDED_DECISION_SCHEMA,
    policy: { ...policy },
    selectionPolicy: { id: 'example/direct-first', revision: 2 },
    occurrence: { startFen, history: ['e2e4'], beforeFen: startFen, afterFen, moveUci: 'e2e4' },
    label: 'Excellent', reasonCodes: ['near.best', 'critical-move'], summary: 'A recorded explanation.',
    candidateOrigins: [{ uci: 'e2e4', origin: { kind: 'root-search', fen: startFen,
      engineBuild: 'test-engine', originatingDepth: 18, reportedDepth: 18 } }],
  };
}

test('records a detached immutable policy, occurrence, decision and origin', () => {
  const source = input(), recorded = recordDecision(source);
  source.policy.id = 'changed';
  source.selectionPolicy.id = 'changed';
  source.occurrence.history[0] = 'd2d4';
  source.reasonCodes[0] = 'changed';
  source.candidateOrigins[0].origin.engineBuild = 'changed';
  assert.equal(recorded.policy.id, policy.id);
  assert.equal(recorded.selectionPolicy.id, 'example/direct-first');
  assert.deepEqual(recorded.occurrence.history, ['e2e4']);
  assert.deepEqual(recorded.reasonCodes, ['near.best', 'critical-move']);
  assert.equal(recorded.candidateOrigins[0].origin.engineBuild, 'test-engine');
  for (const part of [recorded, recorded.policy, recorded.selectionPolicy, recorded.occurrence,
    recorded.occurrence.history, recorded.reasonCodes, recorded.candidateOrigins,
    recorded.candidateOrigins[0], recorded.candidateOrigins[0].origin]) assert.equal(Object.isFrozen(part), true);
  assert.throws(() => { recorded.candidateOrigins[0].origin.engineBuild = 'changed'; }, TypeError);
});

test('reading distinguishes exact, older, newer and foreign policy without promoting evidence', () => {
  for (const [candidate, status, relation] of [
    [policy, 'supported', undefined],
    [{ ...policy, revision: 39 }, 'historical-revision', 'older'],
    [{ ...policy, revision: 41 }, 'historical-revision', 'newer'],
    [{ id: 'other/move-quality', revision: 40 }, 'foreign-policy', undefined],
  ]) {
    const result = readRecordedDecision({ ...input(), policy: candidate }, policy);
    assert.equal(result.status, status);
    if (relation) assert.equal(result.relation, relation);
    assert.equal(result.record.label, 'Excellent');
    assert.equal(result.displayOnly, true);
    assert.equal(result.reusableAsEngineEvidence, false);
    assert.equal(Object.isFrozen(result.record), true);
  }
});

test('unknown schema and unattributed legacy dataset cannot be assumed to use the supported policy', () => {
  for (const value of [{ ...input(), schema: 'classifier-decision/2' },
    { version: 2, classifierVersion: 40, startFen, records: {} }]) {
    const result = readRecordedDecision(value, policy);
    assert.equal(result.status, 'unsupported-schema');
    assert.equal(result.record, null);
    assert.equal(result.reusableAsEngineEvidence, false);
    assert.throws(() => recordDecision(value), /Unsupported recorded decision schema/);
  }
  assert.equal(readRecordedDecision({ ...input(), policy: { revision: 40 } }, policy).status, 'invalid');
  assert.equal(readRecordedDecision(null, policy).status, 'invalid');
});

test('JSON roundtrip retains bounded attribution and drops PV, commands and search identifiers', () => {
  const source = input();
  source.pv = ['e2e4', 'e7e5'];
  source.searchJobId = 'secret';
  source.decision = { signals: { pv: ['e2e4'] } };
  source.candidateOrigins[0].pv = ['e2e4'];
  Object.assign(source.candidateOrigins[0].origin, {
    pv: ['e2e4'], command: 'go depth 18', nodes: 123, jobId: 'private', searchJobId: 'private',
  });
  const wire = JSON.parse(JSON.stringify(recordDecision(source)));
  const restored = readRecordedDecision(wire, policy);
  assert.equal(restored.status, 'supported');
  assert.deepEqual(wire.candidateOrigins[0], { uci: 'e2e4', origin: {
    kind: 'root-search', fen: startFen, engineBuild: 'test-engine', originatingDepth: 18, reportedDepth: 18,
  } });
  assert.equal(JSON.stringify(wire).includes('private'), false);
  assert.equal(JSON.stringify(wire).includes('pv'), false);
  assert.equal(JSON.stringify(wire).includes('command'), false);
  assert.equal(restored.displayOnly, true);
});

test('runtime validation bounds occurrence, policy, reason and provenance fields', () => {
  const invalid = [
    { policy: { ...policy, revision: Infinity } },
    { policy: { ...policy, id: '' } },
    { occurrence: { ...input().occurrence, history: [] } },
    { occurrence: { ...input().occurrence, history: ['e2e5'] } },
    { occurrence: { ...input().occurrence, moveUci: 'd2d4' } },
    { occurrence: { ...input().occurrence, startFen: '' } },
    { label: 'x'.repeat(81) },
    { reasonCodes: Array(17).fill('why') },
    { reasonCodes: ['invalid code'] },
    { summary: 'x'.repeat(1001) },
    { candidateOrigins: Array(4).fill(input().candidateOrigins[0]) },
    { candidateOrigins: [{ uci: 'e2e4', origin: { kind: 'invented' } }] },
    { candidateOrigins: [{ uci: 'e2e4', origin: { kind: 'root-search', reportedDepth: -1 } }] },
  ];
  for (const change of invalid) {
    const value = { ...input(), ...change };
    assert.throws(() => recordDecision(value));
    assert.equal(readRecordedDecision(value, policy).status, 'invalid');
  }
});

test('syntax validation does not claim legal replay of a recorded FEN transition', () => {
  const source = input();
  source.occurrence.afterFen = startFen;
  assert.equal(recordDecision(source).occurrence.afterFen, startFen);
});
