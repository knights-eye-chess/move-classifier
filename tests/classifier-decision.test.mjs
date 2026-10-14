import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import {
  CLASSIFIER_VERSION, hasCurrentClassifierVersion, CLASSIFIER_DECISION_SOURCE, scopedClassifierDecision,
} from '@knights-eye-chess/move-classifier/contracts';
import * as compatibility from '@knights-eye-chess/move-classifier/compatibility';
import { KNIGHTS_EYE_POLICY } from '@knights-eye-chess/move-classifier/policy/knights-eye';

const context = { moveUci: 'e2e4', fenBefore: 'before', fenAfter: 'after' };
function snapshot() {
  const scope = {};
  vm.runInNewContext(CLASSIFIER_DECISION_SOURCE, scope);
  const decision = { classification: 'great', onlyViable: true, nearBest: true, greatMove: true,
    bestEp: .7, afterEp: .7, qualityLoss: 0, bestUtility: .7, secondUtility: .6, uniqueGap: .1,
    candidates: [{}, {}] };
  return JSON.parse(JSON.stringify(scope.classifierDecisionSnapshot(decision,
    context.moveUci, context.fenBefore, context.fenAfter, CLASSIFIER_VERSION, .4, .02, false)));
}

test('public classifier identity and scoped telemetry retain current policy and detached snapshot', () => {
  assert.equal(CLASSIFIER_VERSION, 47);
  assert.equal(KNIGHTS_EYE_POLICY.revision, CLASSIFIER_VERSION);
  assert.equal(hasCurrentClassifierVersion('47'), true);
  assert.equal(hasCurrentClassifierVersion(45), false);
  const raw = snapshot(), restored = scopedClassifierDecision(raw, { ...context, hostId: 'extra' }, 'great', 47);
  assert.deepEqual(restored, raw);
  raw.values.bestEp = 0;
  assert.equal(restored.values.bestEp, .7);
  assert.equal(restored.authority, 'recorded-classifier-decision-not-chess-proof');
});

test('scoped telemetry rejects stale occurrence, version, label and malformed signals', () => {
  for (const change of [
    d => d.fenBefore = 'foreign', d => d.fenAfter = 'foreign', d => d.moveUci = 'd2d4',
    d => d.classifierVersion = 44, d => d.classification = 'best', d => d.version = 'unknown',
    d => d.flags = [], d => d.flags.onlyViable = 'yes', d => d.values.qualityLoss = Infinity,
    d => d.greatQualification.minimumUniquenessGap = .1,
    d => d.greatQualification.effectiveUniquenessGap = 0,
    d => d.greatQualification.minimumAfterExpectedPoints = -1,
    d => d.candidateCount = 257, d => d.candidateCount = 1.5,
    d => d.authority = 'engine-proof',
  ]) {
    const raw = snapshot(); change(raw);
    assert.equal(scopedClassifierDecision(raw, context, 'great', 47), null);
  }
  assert.equal(scopedClassifierDecision(null, context, 'great', 47), null);
  assert.equal(scopedClassifierDecision(snapshot(), context, 'great', 45), null);
  assert.equal(scopedClassifierDecision(snapshot(), context, 'great', 46), null);
});

test('public compatibility strings match reviewed policy-47 source bytes', () => {
  const hashes = {
    POSITION_RULES_SOURCE: '0153742a17461e13c00de4eb887f94c87a2640c820125315dcb20457aef0acf7',
    CLASSIFIER_RULES_SOURCE: '53eb2fbfe6e4f1ab8b334e1d285d7e4a7b031c75a768e5859396baaa6a7af09f',
    ANALYSIS_CORE_SOURCE: '5cbb13a8c46d46b75de12f02709f38574d69d2a67232c99b8a0f4968d5748b08',
  };
  for (const [name, hash] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(compatibility[name]).digest('hex'), hash, name);
  }
  assert.equal(compatibility.CLASSIFIER_DECISION_SOURCE, CLASSIFIER_DECISION_SOURCE);
});
