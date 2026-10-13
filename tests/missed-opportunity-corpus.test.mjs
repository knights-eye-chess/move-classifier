import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { createKnightsEyePolicy } from '@knights-eye-chess/move-classifier/policy/knights-eye';

const corpus = JSON.parse(readFileSync(new URL('./fixtures/missed-opportunity-corpus.json', import.meta.url), 'utf8'));

for (const fixture of corpus.cases) {
  test(fixture.name, () => {
    const policy = createKnightsEyePolicy(Chess);
    const loss = fixture.bestEp - fixture.afterEp;
    const actual = policy.prepared.classifyRecordedSignals({
      forced: false, mateMove: false, greatMove: false, sacrifice: false,
      interestingMove: false, playedBest: false, book: false,
      missedOpportunity: false, missedSpecial: false, missedMaterialOpportunity: false,
      newlyAllowsMate: false, missedImmediateMate: false, abandonedForcedMate: false,
      mateLossClassification: null,
      qualityLoss: loss, outcomeEpLoss: loss, afterEp: fixture.afterEp,
      [fixture.opportunity]: true,
    });
    assert.equal(actual, fixture.expected, `${fixture.name}; ${fixture.source}`);
  });
}

// Boundary and precedence checks exercise the real public policy, not a copy.
for (const [name, loss, afterEp, expected] of [
  ['exact loss threshold', .20, .39, 'miss'],
  ['above loss threshold', .200001, .39, 'blunder'],
  ['exact after threshold', .21, .40, 'miss'],
  ['below after threshold', .21, .399999, 'blunder'],
  ['already losing', .25, .05, 'blunder'],
  ['missing after outcome', .24, undefined, 'miss'],
  ['null after outcome', .24, null, 'miss'],
  ['NaN after outcome', .24, NaN, 'miss'],
  ['infinite after outcome', .24, -Infinity, 'miss'],
  ['string after outcome', .24, '0.1', 'miss'],
]) {
  test(`Miss override: ${name}`, () => {
    const policy = createKnightsEyePolicy(Chess);
    for (const opportunity of ['missedOpportunity', 'missedSpecial', 'missedMaterialOpportunity']) {
      assert.equal(policy.prepared.classifyRecordedSignals({
        qualityLoss: loss, outcomeEpLoss: loss, afterEp, [opportunity]: true,
      }), expected, opportunity);
    }
  });
}

test('Miss override retains higher-priority labels and existing mate-loss policy', () => {
  const policy = createKnightsEyePolicy(Chess);
  const collapse = { qualityLoss: .8, outcomeEpLoss: .8, afterEp: .1, missedMaterialOpportunity: true };
  for (const [override, expected] of [
    [{ forced: true }, 'forced'], [{ mateMove: true }, 'best'],
    [{ greatMove: true, sacrifice: true }, 'brilliant'], [{ book: true }, 'book'],
    [{ greatMove: true }, 'great'], [{ interestingMove: true }, 'interesting'],
    [{ playedBest: true }, 'best'], [{ mateLossClassification: 'mistake' }, 'mistake'],
    [{ abandonedForcedMate: true, afterEp: .5 }, 'mistake'],
    [{ missedImmediateMate: true, afterEp: .7 }, 'miss'],
  ]) assert.equal(policy.prepared.classifyRecordedSignals({ ...collapse, ...override }), expected);
});
