import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { CLASSIFIER_RULES_SOURCE } from '@knights-eye-chess/move-classifier/compatibility';
const scope = {};
vm.runInNewContext(CLASSIFIER_RULES_SOURCE, scope);
const qualification = (best=.7, second=.6, prior=.7, gap=.1, tactical=false) => scope.greatMoveQualification(best, second, prior, gap, tactical);
const eligible = (q, overrides={}) => scope.qualifiesAsGreatMove({ nearBest:true, afterEp:.7, minAfterEp:.4, uniqueGap:.1, qualification:q, ...overrides });
test('Great requires significance beyond ordinary uniqueness; actual normalized gap controls both boundaries', () => {
  assert.equal(eligible(qualification()), false);
  assert.equal(eligible(qualification(.7,.6,.64)), true);
  assert.equal(eligible(qualification(.7,.5,.7,.20), {uniqueGap:.20}), true);
  assert.equal(eligible(qualification(.7,.5,.7,.199999), {uniqueGap:.199999}), false);
  assert.equal(eligible(qualification(.7,.6,.6), {uniqueGap:.074999,onlyViable:true}), false);
  assert.equal(eligible(qualification(.7,.6,.6), {uniqueGap:.075}), true);
});
test('quiet holding and decisive conversion use inclusive best and exclusive alternative thresholds', () => {
  for (const [best,second,expected,reason] of [[.5,.424,true,'quiet-holding'],[.49999,.4,false],[.53,.45,false],[.8,.71999,true,'decisive-conversion'],[.79999,.7,false],[.81,.72,false]]) {
    const q=qualification(best,second,best);
    assert.equal(eligible(q),expected,`${best}/${second}`);
    if(expected) assert.ok(q.reasons.includes(reason));
    assert.equal(eligible(qualification(best,second,best,.1,true)),false,'checks and captures do not receive quiet-band credit');
  }
});
test('Great prerequisites and sacrifice bypass remain independent of significance', () => {
  const q=qualification(.7,.6,.6);
  for(const overrides of [{mateMove:true},{nearBest:false},{afterEp:.399},{evasion:true},{routine:true}]) assert.equal(eligible(q,overrides),false);
  assert.equal(eligible(qualification(),{sacrifice:true,uniqueGap:0,evasion:true,routine:true}),true);
  assert.equal(eligible(qualification(),{sacrifice:true,nearBest:false}),false);
});
test('qualification reports all reasons and signed distances without changing critical diagnostics', () => {
  const q=qualification(.8,.4,.7,.4);
  assert.deepEqual(Array.from(q.reasons),['significant-swing','strong-uniqueness','quiet-holding','decisive-conversion']);
  assert.equal(q.distances.conversionBest,0);
  assert.equal(q.distances.holdingSecond,.45-.4);
});

import { Chess } from 'chess.js';
import { createKnightsEyePolicy } from '@knights-eye-chess/move-classifier/policy/knights-eye';
const conversion = {
  "move": {
    "color": "b",
    "san": "Nc5",
    "uci": "e4c5"
  },
  "beforeFen": "1r1q4/Q1p2kbp/3pb1p1/4pn2/4n3/N1PP4/PP3PPP/R1B1K2R b KQ - 0 15",
  "afterFen": "1r1q4/Q1p2kbp/3pb1p1/2n1pn2/8/N1PP4/PP3PPP/R1B1K2R w KQ - 1 16",
  "beforeAnalysis": {
    "depth": 15,
    "scoreCp": 727,
    "mate": null,
    "bestmove": "e4c5",
    "candidates": [
      {
        "depth": 15,
        "scoreCp": 727,
        "mate": null,
        "pv": [
          "e4c5",
          "c1g5",
          "g7f6",
          "g5f6",
          "f7f6",
          "b2b4",
          "b8a8"
        ]
      },
      {
        "depth": 15,
        "scoreCp": 304,
        "mate": null,
        "pv": [
          "e4f6",
          "a7a4",
          "f6d5",
          "a3c4",
          "g6g5",
          "g2g3"
        ]
      },
      {
        "depth": 15,
        "scoreCp": 281,
        "mate": null,
        "pv": [
          "b8a8",
          "a7b7",
          "e4c5",
          "b7f3",
          "d6d5",
          "e1g1",
          "f7g8",
          "a3c2",
          "e5e4",
          "d3e4",
          "d5e4",
          "f3e2",
          "d8d7",
          "f2f3",
          "e4f3",
          "e2f3",
          "e6d5",
          "f3e2",
          "c7c6"
        ]
      }
    ]
  },
  "afterAnalysis": {
    "depth": 15,
    "scoreCp": -776,
    "mate": null,
    "bestmove": "a7a5",
    "candidates": [
      {
        "depth": 15,
        "scoreCp": -776,
        "mate": null,
        "pv": [
          "a7a5",
          "c5d3",
          "e1d2",
          "b8a8",
          "a5b5",
          "d3c1",
          "g2g4",
          "d8g5",
          "d2c2",
          "g5g4",
          "b5c6",
          "g4e2",
          "c2c1"
        ]
      },
      {
        "depth": 15,
        "scoreCp": -784,
        "mate": null,
        "pv": [
          "c1e3",
          "f5e3",
          "f2e3",
          "b8a8",
          "e1g1",
          "f7e7",
          "a7a8",
          "d8a8",
          "d3d4",
          "c5a6",
          "a1e1",
          "g7h6",
          "b2b4",
          "a8c8",
          "a3c2"
        ]
      },
      {
        "depth": 15,
        "scoreCp": -798,
        "mate": null,
        "pv": [
          "c1g5",
          "c5d3",
          "e1e2",
          "b8b2",
          "g5d2",
          "g7h6",
          "h1d1",
          "d3c5",
          "g2g4",
          "f5e7",
          "a1b1",
          "b2a2",
          "b1b8",
          "d8d7",
          "e2e1",
          "h6d2",
          "d1d2",
          "e7c6",
          "a7a8",
          "a2a1",
          "b8b1",
          "a1b1",
          "a3b1",
          "e6g4",
          "a8a2",
          "g4e6"
        ]
      }
    ]
  },
  "priorEp": null,
  "book": false
};
const holding = {
  "move": {
    "color": "w",
    "san": "Qb3+",
    "uci": "d1b3"
  },
  "beforeFen": "r1b2rk1/p1p3p1/1p4q1/2N2p2/1P3R2/2PP2pP/P5P1/R2Q2K1 w - - 0 21",
  "afterFen": "r1b2rk1/p1p3p1/1p4q1/2N2p2/1P3R2/1QPP2pP/P5P1/R5K1 b - - 1 21",
  "beforeAnalysis": {
    "depth": 15,
    "scoreCp": 44,
    "mate": null,
    "bestmove": "d1f3",
    "candidates": [
      {
        "depth": 15,
        "scoreCp": 44,
        "mate": null,
        "pv": [
          "d1f3",
          "c7c6",
          "c5e4",
          "a7a5",
          "e4g3",
          "a5b4",
          "f4b4",
          "b6b5",
          "a2a4",
          "a8a5",
          "b4d4",
          "c6c5",
          "d4h4",
          "c8d7"
        ]
      },
      {
        "depth": 15,
        "scoreCp": -91,
        "mate": null,
        "pv": [
          "c5b3",
          "g6g5",
          "d1f3",
          "c8b7",
          "h3h4",
          "b7f3",
          "h4g5",
          "f3g4",
          "b3d2",
          "a8d8",
          "d3d4",
          "g8h7",
          "d2f1",
          "d8e8",
          "f1g3",
          "h7g6",
          "a1f1",
          "f8f7",
          "d4d5",
          "e8e3",
          "g3f5",
          "g4f5",
          "g2g4",
          "e3c3",
          "f4f5",
          "f7f5",
          "f1f5"
        ]
      },
      {
        "depth": 15,
        "scoreCp": -98,
        "mate": null,
        "pv": [
          "d1b3",
          "g6f7",
          "b3f7",
          "f8f7",
          "c5b3",
          "g7g5",
          "f4f1",
          "f5f4",
          "f1e1",
          "g8g7",
          "e1e5",
          "g7g6",
          "b3d4",
          "a7a5",
          "b4b5"
        ]
      }
    ]
  },
  "afterAnalysis": {
    "depth": 15,
    "scoreCp": 95,
    "mate": null,
    "bestmove": "g6f7",
    "candidates": [
      {
        "depth": 15,
        "scoreCp": 95,
        "mate": null,
        "pv": [
          "g6f7",
          "b3f7",
          "f8f7",
          "c5b3",
          "g7g5",
          "f4f1",
          "f7e7",
          "b3d4",
          "f5f4",
          "d4f3",
          "c8b7",
          "f3g5",
          "e7e2",
          "g5e4",
          "a8f8",
          "f1f3",
          "g8g7"
        ]
      },
      {
        "depth": 15,
        "scoreCp": -337,
        "mate": null,
        "pv": [
          "f8f7",
          "a1e1",
          "g6h6",
          "f4f3",
          "g7g5",
          "f3g3",
          "b6c5",
          "b3d5",
          "c8b7",
          "d5b7",
          "a8d8",
          "e1e5",
          "c7c6",
          "b7a6",
          "c5b4",
          "a6a5",
          "d8d5",
          "e5d5",
          "c6d5",
          "a5d8",
          "g8h7",
          "c3b4",
          "h6b6",
          "d8b6"
        ]
      },
      {
        "depth": 15,
        "scoreCp": -699,
        "mate": null,
        "pv": [
          "c8e6",
          "c5e6",
          "f8f7",
          "e6d4",
          "a8e8",
          "f4f5",
          "c7c5",
          "b4c5",
          "b6c5",
          "f5f7",
          "g6f7",
          "b3f7",
          "g8f7",
          "d4f5",
          "e8d8",
          "d3d4",
          "c5d4",
          "f5d4",
          "d8c8",
          "a1f1",
          "f7g8"
        ]
      }
    ]
  },
  "priorEp": 0.5077374775071715,
  "book": false
};

test('Nc5 retains Great from decisive conversion without prior-history swing', () => {
  const decision=createKnightsEyePolicy(Chess).classify(conversion);
  assert.equal(decision.classification,'great');
  assert.equal(decision.priorEpAvailable,false);
  assert.ok(decision.greatQualification.reasons.includes('decisive-conversion'));
});
test('Qb3+ misses a Great quiet Qf3; the hypothetical move uses its own tactical flag', () => {
  const policy=createKnightsEyePolicy(Chess), decision=policy.classify(holding);
  assert.equal(decision.classification,'miss');
  assert.equal(decision.bestSpecial.san,'Qf3');
  assert.equal(decision.bestSpecial.qualifies,true);
  assert.ok(decision.bestSpecial.greatQualification.reasons.includes('quiet-holding'));
  assert.equal(decision.greatQualification.reasons.includes('quiet-holding'),false);
  const board=new Chess(holding.beforeFen), move=board.move('Qf3');
  const played=policy.classify({...holding,move:{...move,uci:move.lan},afterFen:board.fen(),afterAnalysis:{depth:15,scoreCp:-44,mate:null,candidates:[]}});
  assert.equal(played.classification,'great');
});
