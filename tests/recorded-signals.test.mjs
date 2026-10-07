import assert from 'node:assert/strict';
import test from 'node:test';
import { Chess } from 'chess.js';
import { createKnightsEyePolicy } from '@knights-eye-chess/move-classifier/policy/knights-eye';

const signals=()=>({forced:false,mateMove:false,greatMove:false,sacrifice:false,interestingMove:false,playedBest:false,
  book:false,missedOpportunity:false,missedSpecial:false,missedMaterialOpportunity:false,newlyAllowsMate:false,
  missedImmediateMate:false,abandonedForcedMate:false,qualityLoss:.01,outcomeEpLoss:.01,afterEp:.5,mateLossClassification:null});

test('recorded signals use the native label precedence and outcome/quality loss distinction',()=>{
 const policy=createKnightsEyePolicy(Chess);
 for(const [expected,override] of [
  ['good',{}],['okay',{qualityLoss:.04}],['dubious',{qualityLoss:.08}],['mistake',{qualityLoss:.1}],
  ['blunder',{qualityLoss:.01,outcomeEpLoss:.21}],['miss',{missedOpportunity:true,outcomeEpLoss:.08}],
  ['best',{playedBest:true,outcomeEpLoss:.5}],['book',{book:true}],
  ['great',{greatMove:true}],['brilliant',{greatMove:true,sacrifice:true}],['interesting',{interestingMove:true}],
  ['forced',{forced:true,mateMove:true,book:true}],['best',{mateMove:true,mateLossClassification:'blunder'}],
  ['miss',{book:true,mateLossClassification:'miss'}],
 ]) assert.equal(policy.prepared.classifyRecordedSignals({...signals(),...override}),expected);
});

test('recorded signal consistency is pure, detached from acquisition caches and uses native mate-policy defaults',()=>{
 const policy=createKnightsEyePolicy(Chess),value={...signals(),missedImmediateMate:true,afterEp:.7};
 const original=structuredClone(value),label=policy.prepared.classifyRecordedSignals(value);
 assert.equal(label,'miss');assert.deepEqual(value,original);
 assert.equal(policy.prepared.classifyRecordedSignals({...value,winningLine:0,notBadLine:0}),label,
  'caller cannot override current policy mate thresholds');
 policy.resetEvidence();assert.equal(policy.prepared.classifyRecordedSignals(value),label);
 assert.equal(policy.fork().prepared.classifyRecordedSignals(value),label);
});
