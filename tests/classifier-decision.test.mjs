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
  assert.equal(CLASSIFIER_VERSION, 44);
  assert.equal(KNIGHTS_EYE_POLICY.revision, CLASSIFIER_VERSION);
  assert.equal(hasCurrentClassifierVersion('44'), true);
  assert.equal(hasCurrentClassifierVersion(43), false);
  const raw = snapshot(), restored = scopedClassifierDecision(raw, { ...context, hostId: 'extra' }, 'great', 44);
  assert.deepEqual(restored, raw);
  raw.values.bestEp = 0;
  assert.equal(restored.values.bestEp, .7);
  assert.equal(restored.authority, 'recorded-classifier-decision-not-chess-proof');
});

test('scoped telemetry rejects stale occurrence, version, label and malformed signals', () => {
  for (const change of [
    d => d.fenBefore = 'foreign', d => d.fenAfter = 'foreign', d => d.moveUci = 'd2d4',
    d => d.classifierVersion = 43, d => d.classification = 'best', d => d.version = 'unknown',
    d => d.flags = [], d => d.flags.onlyViable = 'yes', d => d.values.qualityLoss = Infinity,
    d => d.greatQualification.minimumUniquenessGap = .1,
    d => d.greatQualification.effectiveUniquenessGap = 0,
    d => d.greatQualification.minimumAfterExpectedPoints = -1,
    d => d.candidateCount = 257, d => d.candidateCount = 1.5,
    d => d.authority = 'engine-proof',
  ]) {
    const raw = snapshot(); change(raw);
    assert.equal(scopedClassifierDecision(raw, context, 'great', 44), null);
  }
  assert.equal(scopedClassifierDecision(null, context, 'great', 44), null);
  assert.equal(scopedClassifierDecision(snapshot(), context, 'great', 43), null);
});

test('public compatibility strings match reviewed policy-44 source bytes', () => {
  const hashes = {
    POSITION_RULES_SOURCE: '0153742a17461e13c00de4eb887f94c87a2640c820125315dcb20457aef0acf7',
    CLASSIFIER_RULES_SOURCE: 'b986cc82a917bf65c6987dd25300eb3fa0f57fb1cd36330560a584392eb43104',
    ANALYSIS_CORE_SOURCE: '6b1c79fc1bf8cc1eacbd06b80b1748608b19a211763a381e7836726b73718b0a',
  };
  for (const [name, hash] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(compatibility[name]).digest('hex'), hash, name);
  }
  assert.equal(compatibility.CLASSIFIER_DECISION_SOURCE, CLASSIFIER_DECISION_SOURCE);
});
