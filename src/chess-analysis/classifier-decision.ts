import { CLASSIFIER_VERSION } from './knights-eye-policy-runtime.js';
export { CLASSIFIER_VERSION } from './knights-eye-policy-runtime.js';

/** Exact move snapshot required to scope recorded telemetry. Hosts may supply richer contexts. */
export type ClassifierDecisionContext = { moveUci: string; fenBefore: string; fenAfter: string };

export function hasCurrentClassifierVersion(value: unknown): boolean {
  return Number(value) === CLASSIFIER_VERSION;
}

/** Generated runtime telemetry: copies the completed decision, never classifies. */
export const CLASSIFIER_DECISION_SOURCE = String.raw`
    function classifierDecisionSnapshot(decision,moveUci,beforeFen,afterFen,classifierVersion,minimumAfterExpectedPoints,nearBestQualityLossLimit,book){
      var flags={book:!!book},values={};
      ['forced','mateMove','playedBest','nearBest','onlyViable','critical','evasion','routine','sacrifice','interestingMove','greatMove','missedOpportunity','missedSpecial','missedMaterialOpportunity','newlyAllowsMate','missedImmediateMate','abandonedForcedMate'].forEach(function(key){flags[key]=!!decision[key]});
      ['beforeCp','afterForMover','loss','bestEp','afterEp','epLoss','qualityLoss','bestUtility','playedUtility','secondEp','secondUtility','uniqueGap','priorEp','bestMate','playedMate','mateDifference'].forEach(function(key){var value=decision[key];values[key]=typeof value==='number'&&Number.isFinite(value)?value:null});
      return {version:'classifier-decision/1',classifierVersion:classifierVersion,classification:String(decision.classification||''),moveUci:moveUci,fenBefore:beforeFen,fenAfter:afterFen,flags:flags,values:values,candidateCount:Array.isArray(decision.candidates)?decision.candidates.length:0,greatQualification:{minimumAfterExpectedPoints:minimumAfterExpectedPoints,nearBestQualityLossLimit:nearBestQualityLossLimit,uniquenessInput:'normalized-root-gap',effectiveUniquenessGap:decision.uniqueGap,minimumUniquenessGap:.075,priorEpAvailable:!!decision.priorEpAvailable,root:decision.greatQualification?JSON.parse(JSON.stringify(decision.greatQualification)):null},mateLossClassification:decision.mateLossClassification||null,authority:'recorded-classifier-decision-not-chess-proof'}
    }
`;

/** Accept only a decision bound to this exact snapshot, never a stale badge. */
export function scopedClassifierDecision(value: unknown, context: ClassifierDecisionContext,
  classification: unknown, classifierVersion: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  if (d.version !== 'classifier-decision/1' || d.classifierVersion !== CLASSIFIER_VERSION
    || d.classifierVersion !== classifierVersion || d.classification !== classification
    || d.moveUci !== context.moveUci || d.fenBefore !== context.fenBefore || d.fenAfter !== context.fenAfter) return null;
  for (const key of ['flags', 'values', 'greatQualification']) {
    const fields = d[key];
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
  }
  if (!Object.values(d.flags as object).every(v => typeof v === 'boolean')
    || !Object.values(d.values as object).every(v => v === null || typeof v === 'number' && Number.isFinite(v))) return null;
  const flags = d.flags as Record<string, unknown>, values = d.values as Record<string, unknown>;
  const qualification = d.greatQualification as Record<string, unknown>;
  if (!['nearBest','greatMove','onlyViable','routine','evasion','sacrifice','forced','mateMove','playedBest','book'].every(key => typeof flags[key] === 'boolean')
    || !['bestEp','afterEp','qualityLoss','bestUtility','secondUtility','uniqueGap'].every(key => typeof values[key] === 'number' && Number.isFinite(values[key]))
    || qualification.uniquenessInput !== 'normalized-root-gap'
    || qualification.minimumUniquenessGap !== .075
    || qualification.effectiveUniquenessGap !== values.uniqueGap
    || !['minimumAfterExpectedPoints','nearBestQualityLossLimit'].every(key => typeof qualification[key] === 'number' && Number.isFinite(qualification[key]) && Number(qualification[key]) >= 0 && Number(qualification[key]) <= 1)
    || !Number.isInteger(d.candidateCount) || Number(d.candidateCount) < 0 || Number(d.candidateCount) > 256
    || d.authority !== 'recorded-classifier-decision-not-chess-proof') return null;
  const root = qualification.root as Record<string, unknown> | null;
  if (!root || typeof root !== 'object' || Array.isArray(root)
    || typeof qualification.priorEpAvailable !== 'boolean'
    || !['rootBestEp','rootSecondEp','priorEp'].every(key => typeof root[key] === 'number' && Number.isFinite(root[key]))
    || !Array.isArray(root.reasons) || root.reasons.length > 4
    || !root.reasons.every(reason => ['significant-swing','strong-uniqueness','quiet-holding','decisive-conversion'].includes(reason))
    || !root.distances || typeof root.distances !== 'object' || Array.isArray(root.distances)
    || !['uniqueness','swing','strongUniqueness','holdingBest','holdingSecond','conversionBest','conversionSecond'].every(key => typeof (root.distances as Record<string, unknown>)[key] === 'number' && Number.isFinite((root.distances as Record<string, unknown>)[key]))) return null;
  return structuredClone(d);
}
