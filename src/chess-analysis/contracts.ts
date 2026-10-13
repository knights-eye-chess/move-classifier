import type { EngineLine, PositionAnalysis, SearchRequest } from './analysis-types';
import type { PolicyIdentity } from './recorded-decision';

export type ChessMove = { from: string; to: string; san: string; color: string; promotion?: string; piece?: string; captured?: string; flags?: string; uci: string };
export type ChessConstructor = new (fen: string) => {
  fen(): string; move(move: { from: string; to: string; promotion?: string }): Omit<ChessMove, 'uci'> | null;
  moves(options?: { verbose?: boolean }): unknown[]; isCheckmate(): boolean; inCheck(): boolean;
};
export type ClassificationDecision = { classification: string };
export type CandidateMove = { uci: string };
export type LivePosition<V = never> = Omit<PositionAnalysis, 'sacrificeVerification'> & { sacrificeVerification?: V };
export type AnalysisContext<X = null, V = never> = {
  move: ChessMove; previousMove?: ChessMove | null;
  beforeFen: string; afterFen: string; priorFen?: string; priorOwnBeforeFen?: string;
  previousMaterialExchange?: X | null; book?: boolean; priorEp?: number | null;
  beforeAnalysis?: LivePosition<V>; afterAnalysis?: LivePosition<V>;
  /** Edge-local restricted comparison; never unrestricted ranking/evidence. */
  comparisonAnalysis?: PositionAnalysis;
};
export type ClassificationComparisonRequest = Readonly<{ fen: string; depth: number; multiPv: number; rootMoves: string[] }>;
export type VerificationState<V, C extends CandidateMove> = { candidates: C[]; verification: V | null };
export type ContinuationScope = Readonly<{ fen: string; depth: number; rootMoves: string[]; acceptanceUci: string }>;
export type ContinuationEvidence = Readonly<{ request: ContinuationScope; analysis: PositionAnalysis }>;
export type AnalysisLogic<D extends ClassificationDecision = ClassificationDecision, X = null, V = never, C extends CandidateMove = CandidateMove> = {
  readonly identity: PolicyIdentity;
  /** Optional request-local policy instance for policies with evidence caches. */
  fork?(): AnalysisLogic<D,X,V,C>;
  resetEvidence?(): void;
  terminal(fen: string, depth: number): PositionAnalysis | null;
  legalCount(fen: string): number;
  exchange(context: AnalysisContext<X, V>): { inherited: boolean; originFen: string };
  offer(context: AnalysisContext<X, V>, after: LivePosition<V>, baseline: string): VerificationState<V, C>;
  verify(context: AnalysisContext<X, V>, state: VerificationState<V, C>, lines: EngineLine[]): V | null;
  /** Optional second-stage, exact-root verification of a board-established continuation. */
  continuationRequests?(context: AnalysisContext<X, V>, state: VerificationState<V, C>, verification: V): ContinuationScope[];
  verifyContinuations?(context: AnalysisContext<X, V>, state: VerificationState<V, C>, verification: V, evidence: readonly ContinuationEvidence[]): V | null;
  verificationSatisfies(verification: V, depth: number): boolean;
  classificationComparison?(context: AnalysisContext<X, V>): ClassificationComparisonRequest | null;
  admitClassificationComparison?(context: AnalysisContext<X, V>, request: ClassificationComparisonRequest, result: PositionAnalysis): PositionAnalysis | null;
  classify(context: AnalysisContext<X, V>): D;
  priorPoints(position: PositionAnalysis): number;
};
export type AnalysisPolicy<D extends ClassificationDecision = ClassificationDecision, X = null, V = never, C extends CandidateMove = CandidateMove> = AnalysisLogic<D, X, V, C> & {
  materialExchangeForMove(move: ChessMove, fen: string, previous: X | null): X;
};
export type AnalysisEngine = {
  /** Omitted declaration means the adapter accepts the complete SearchRequest contract. */
  capabilities?: { multiPv: boolean; rootMoves: boolean };
  search(request: SearchRequest): Promise<PositionAnalysis>;
};
export type SearchPolicy = Readonly<{ candidateCount: number; verificationDepth: number }>;
export const DEFAULT_SEARCH_POLICY: SearchPolicy = Object.freeze({ candidateCount: 3, verificationDepth: 10 });
export type OpeningLookup = (request: { startFen: string; history: readonly string[]; afterFen: string }) => { eco: string; name: string } | null;
export type ChessAnalyzerOptions = { openingLookup?: OpeningLookup; searchPolicy?: SearchPolicy };
export type ExactAnalysisRequest = { startFen: string; history: readonly string[]; depth: number; book?: boolean; signal?: AbortSignal };
/** Caller attests live evidence; admission checks its shape, legal PV and coverage.
 * A recorded display decision is not accepted by this shape. */
export type SuppliedPositionEvidence = { kind: 'live-position'; fen: string; analysis: PositionAnalysis; rootMoves?: readonly string[] };
export type SuppliedAnalysisRequest = ExactAnalysisRequest & { evidence: readonly SuppliedPositionEvidence[] };
export type UnavailableReason = 'invalid-request' | 'cancelled' | 'engine-unavailable' | 'unsupported-capability' | 'incomplete-evidence' | 'engine-failure' | 'verification-unavailable' | 'comparison-unavailable';
export type Unavailable = { status: 'unavailable'; reason: UnavailableReason; message: string; request?: Readonly<{ fen: string; depth: number; multiPv: number; rootMoves?: readonly string[] }> };
export type AnalysisOutcome<D extends ClassificationDecision, X = null, V = never> =
  | { status: 'complete'; policy: PolicyIdentity; decision: D; before: LivePosition<V>; after: LivePosition<V>; context: AnalysisContext<X,V> }
  | Unavailable;
