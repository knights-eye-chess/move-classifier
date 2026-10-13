import { createKnightsEyePolicyRuntime, CLASSIFIER_VERSION } from './knights-eye-policy-runtime.js';
import type { AnalysisContext, ClassificationComparisonRequest, AnalysisPolicy, ChessConstructor, ChessMove, ClassificationDecision, VerificationState, ContinuationScope, ContinuationEvidence } from './contracts';
import type { PolicyIdentity } from './recorded-decision';
import type { EngineLine, PositionAnalysis } from './analysis-types';

export const KNIGHTS_EYE_POLICY: PolicyIdentity = Object.freeze({ id: 'knights-eye/move-quality', revision: CLASSIFIER_VERSION });
export type MaterialExchangeState = {
  transition: 'continues' | 'creates' | 'settles' | 'retains' | 'none';
  originFen: string; inherited: boolean;
  activeThreads: { originFen: string; targetSquare: string; creatorUci: string; lastCaptureUci: string }[];
  transitions: { kind: string; originFen?: string; targetSquare?: string }[];
};
export type SacrificeCandidate = {
  uci: string; capturedSquare: string; capturedPiece: string; capturedValue: number;
  materialOffer: number; rawOffer: number; offerBaselineFen: string;
  directRecoveryResidual: number; directRecoveryCount: number;
  directRecoveryUcis: string[]; recoveryNetLosses: number[]; bestImmediateRecoveryNet: number;
  boardCounterplay: string[];
  offerMode: 'static' | 'declined-recapture' | 'forcing-check';
  equalRecaptureUcis: string[]; declineReplyUcis: string[]; continuationOverBudget: boolean;
  materialThreadOrigin: 'inherited-exchange' | 'created-offer';
};
export type SacrificeVerification = {
  classifierVersion: number; candidateScopeKey: string; candidateUcis: string[];
  source: string; depth: number; acceptedMove: string; capturedSquare: string;
  capturedPiece: string; capturedValue: number; materialOffer: number;
  qualifyingMaterialOffer: number; rawQualifyingMaterialOffer: number;
  offerBaselineFen: string; scoreCp: number | null; mate: number | null; pv: string[];
  favorableMate: boolean; directRecoveryResidual: number;
  directRecoveryCount: number; directRecoveryUcis: string[];
  materialThreadOrigin: 'inherited-exchange' | 'created-offer';
  coverageComplete: boolean; verifiedCandidateUcis: string[]; worstAcceptedEp: number;
  offerMode: SacrificeCandidate['offerMode']; declinedRecaptureWitness: boolean;
  forcingCheckWitness: boolean;
  continuationComplete: boolean; continuationStatus: 'none' | 'pending' | 'qualified' | 'unsound' | 'over-budget';
  acceptanceLines: { uci: string; depth: number; scoreCp: number | null; mate: number | null; pv: string[] }[];
  declineBestEp?: number; recaptureBestEp?: number; continuationRoots?: string[];
};
export type MaterialOpportunity = {
  qualifies: boolean; opportunityType: 'clean_material_win'; bestMove: string; bestMoveSan: string;
  capturedPiece: string; capturedValue: number; immediateMaterialGain: number; worstCaseMaterialGain: number;
  legalRecaptureCount: number; minimumGain: number; inheritedExchange: boolean;
  routineRecapture: boolean; poisonedCapture: boolean; reason: string;
};
export type BestMoveSpecial = {
  qualifies: boolean; uci: string; san: string; evasion: boolean; reason?: string;
  baseRoutine?: boolean; routine?: boolean; routineOverride?: boolean; pawnBreakthrough?: boolean;
  tacticalConversion?: boolean; uniqueGap?: number; sacrifice?: boolean; forcesMate?: boolean;
  tactical?: boolean; onlyViable?: boolean; critical?: boolean; captured?: string;
  capturedValue?: number; movedValue?: number; capturedSoon?: boolean; materialOffer?: number;
  materialExchange?: MaterialExchangeState; verification?: SacrificeVerification | null;
  minAfterEp?: number; bestEp?: number;
};
export type PreparedEngineLine = Omit<EngineLine, 'multipv' | 'scoreProvenance'> & {
  multipv?: number;
  scoreProvenance?: {
    kind: 'root-search' | 'multipv-derived' | 'subsequent-position' | 'restored-fallback' | 'legacy-unknown' | 'terminal-position' | 'reconciliation-root';
    fen?: string | null; originatingDepth?: number | null; reportedDepth?: number | null;
    fallbackDepth?: number | null; engineBuild?: string; command?: string | null;
  };
};
export type KnightsEyeLabel = 'brilliant' | 'great' | 'best' | 'good' | 'okay' | 'dubious' | 'mistake' | 'miss' | 'blunder' | 'book' | 'forced' | 'interesting';
export type KnightsEyeDecision = ClassificationDecision & {
  classification: KnightsEyeLabel;
  comparisonSource: 'root-candidate' | 'after-position' | 'comparison-root' | 'checkmate' | 'terminal-position';
  comparisonBestmove: string; comparisonDepth: number; comparisonCandidates: PreparedEngineLine[] | null;
  beforeCp: number; afterForMover: number; loss: number; bestEp: number; afterEp: number;
  epLoss: number; qualityLoss: number; bestUtility: number; playedUtility: number;
  bestMate: number | null; playedMate: number | null; mateDifference: number | null;
  playedBest: boolean; nearBest: boolean; critical: boolean; onlyViable: boolean;
  forced: boolean; evasion: boolean; routine: boolean; tactical: boolean;
  materialExchange: MaterialExchangeState;
  sacrifice: boolean; interestingMove: boolean; greatMove: boolean; mateMove: boolean;
  forcesMate: boolean; newlyAllowsMate: boolean; missedImmediateMate: boolean;
  abandonedForcedMate: boolean; missedSpecial: boolean; missedMaterialOpportunity: boolean;
  missedOpportunity: boolean; sacrificeCandidates: SacrificeCandidate[];
  sacrificeVerification: SacrificeVerification | null;
  candidates: PreparedEngineLine[]; second: PreparedEngineLine | undefined; secondEp: number; alternativeEp: number; playedMateOnly: boolean; secondUtility: number;
  uniqueGap: number; priorEp: number; matingLine: boolean;
  mateLossClassification: '' | 'miss' | 'mistake' | 'blunder'; bestSpecial: BestMoveSpecial;
  bestMaterialOpportunity: MaterialOpportunity;
  missedOpportunityDiagnostic: (MaterialOpportunity & { outcomeLoss: number }) | null;
};
/** Host-prevalidated positions may include derived candidate evidence. This is
 * deliberately distinct from the replay core's admitted live-position inputs. */
export type PreparedPosition = Partial<Omit<PositionAnalysis, 'candidates' | 'sacrificeVerification' | 'scoreProvenance'>> & {
  candidates?: PreparedEngineLine[]; scoreProvenance?: PreparedEngineLine['scoreProvenance'];
  sacrificeVerification?: SacrificeVerification | null; seeded?: boolean;
};
export type PreparedAnalysisContext = Omit<AnalysisContext<MaterialExchangeState, SacrificeVerification>, 'beforeAnalysis' | 'afterAnalysis'> & {
  beforeAnalysis?: PreparedPosition; afterAnalysis?: PreparedPosition;
};
export type KnightsEyeHistoryContext = {
  priorOwnBeforeFenForPosition?(fen: string): string;
  treePreviousMoveForFen?(fen: string): (ChessMove & { analysis?: { material_exchange?: MaterialExchangeState } }) | null;
};
/** These getters return runtime-only host caches, never recorded decisions. The
 * host replaces or clears them when its game/engine/evidence epoch changes. */
export type KnightsEyePreparedCaches = {
  /** Deprecated compatibility input. Policy 45 has no forced-exposure cache. */
  materialExposure?(): Record<string, number>;
  sacrificeVerification?(): Record<string, SacrificeVerification>;
};
export type KnightsEyePolicyOptions = { historyContext?: KnightsEyeHistoryContext; preparedCaches?: KnightsEyePreparedCaches };
export type SacrificeLineEvaluation = { verification: SacrificeVerification | null; qualifying: boolean; covered: boolean; verifications: SacrificeVerification[] };
/** Recorded policy inputs only. Recomputing a label from these caller-owned
 * signals checks consistency; it does not verify their chess/evidence truth. */
export type RecordedClassificationSignals = Pick<KnightsEyeDecision,
  'forced' | 'mateMove' | 'greatMove' | 'sacrifice' | 'interestingMove' | 'playedBest'
  | 'missedOpportunity' | 'missedSpecial' | 'missedMaterialOpportunity' | 'newlyAllowsMate'
  | 'missedImmediateMate' | 'abandonedForcedMate' | 'qualityLoss' | 'afterEp'> & {
  book: boolean; outcomeEpLoss: number; mateLossClassification: KnightsEyeDecision['mateLossClassification'] | null;
};
export type KnightsEyePreparedOperations = {
  classificationComparison(context: PreparedAnalysisContext): ClassificationComparisonRequest | null;
  admitClassificationComparison(context: PreparedAnalysisContext, request: ClassificationComparisonRequest, result: PositionAnalysis): PositionAnalysis | null;
  classifyRecordedSignals(signals: RecordedClassificationSignals): KnightsEyeLabel;
  numericScore(position?: Pick<PreparedPosition, 'scoreCp' | 'mate'> | null): number;
  expectedPoints(cp: number): number;
  notBadOutcomeLine(): number;
  pieceValue(piece?: string | null): number;
  legalMoves(fen: string): Omit<ChessMove, 'uci'>[];
  terminalPositionResult(fen: string, depth: number): PositionAnalysis | null;
  materialExchangeForMove(move: ChessMove, fen: string, previous?: MaterialExchangeState | null): MaterialExchangeState;
  canLegallyCapture(fen: string, square: string): boolean;
  unsafePieces(fen: string, white: boolean, rookMinorCaptureSquare: string): string[];
  trappedUnsafePieces(fen: string, white: boolean, unsafe: string[]): string[];
  sacrificeCaptureCandidates(move: ChessMove, beforeFen: string, afterFen: string, priorOwnBeforeFen?: string, exchangeThreadBaselineFen?: string): SacrificeCandidate[];
  sacrificeVerificationKey(afterFen: string, candidates: readonly SacrificeCandidate[]): string;
  evaluateSacrificeLines(move: ChessMove, beforeFen: string, afterFen: string, candidates: SacrificeCandidate[], lines: PreparedEngineLine[], source: string, complete: boolean): SacrificeLineEvaluation;
  sacrificeVerificationState(move: ChessMove, beforeFen: string, afterFen: string, after?: PreparedPosition | null, priorOwnBeforeFen?: string, exchangeThreadBaselineFen?: string | null): VerificationState<SacrificeVerification, SacrificeCandidate>;
  continuationRequests(context: PreparedAnalysisContext, state: VerificationState<SacrificeVerification, SacrificeCandidate>, verification: SacrificeVerification): ContinuationScope[];
  verifyContinuations(context: PreparedAnalysisContext, state: VerificationState<SacrificeVerification, SacrificeCandidate>, verification: SacrificeVerification, evidence: readonly ContinuationEvidence[]): SacrificeVerification | null;
  classifyAnalyzedMove(context: PreparedAnalysisContext): KnightsEyeDecision;
};
export type KnightsEyeAnalysisPolicy = AnalysisPolicy<KnightsEyeDecision, MaterialExchangeState, SacrificeVerification, SacrificeCandidate> & {
  /** Preserves historical MultiPV-first verification precedence. No admission,
   * replay, acquisition or complete-outcome guarantee is performed here. */
  classifyPrepared(context: PreparedAnalysisContext): KnightsEyeDecision;
  readonly prepared: KnightsEyePreparedOperations;
};

/** Typed boundary around the native policy computation. No default
 * opening data, engine hosting, source evaluation or persistence is imported. */
export function createKnightsEyePolicy(Chess: ChessConstructor, engineKind = 'stockfish', options: KnightsEyePolicyOptions = {}): KnightsEyeAnalysisPolicy {
  const native = createKnightsEyePolicyRuntime(Chess, engineKind, options.historyContext, options.preparedCaches) as unknown as Omit<KnightsEyeAnalysisPolicy, 'identity' | 'verificationSatisfies' | 'classify'> & { classify(context: AnalysisContext<MaterialExchangeState, SacrificeVerification>, verification?: SacrificeVerification): KnightsEyeDecision };
  // Acquisition requests keep private caches even when the prepared consumer
  // uses host caches. Never import a host's existing verification into a fork.
  return { ...native, identity: KNIGHTS_EYE_POLICY, fork: () => createKnightsEyePolicy(Chess, engineKind, { historyContext: options.historyContext }),
    verificationSatisfies: (verification, depth) => verification.classifierVersion === CLASSIFIER_VERSION && verification.coverageComplete && verification.depth >= depth,
    classify(context: AnalysisContext<MaterialExchangeState, SacrificeVerification>) {
      // The service selects verification at the configured depth. Avoid allowing
      // a shallower ordinary MultiPV line to shadow that explicit verification.
      return native.classify(context, context.afterAnalysis?.sacrificeVerification);
    },
  };
}
