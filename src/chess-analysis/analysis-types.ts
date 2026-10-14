/** Shapes consumed by classification. The host owns search transport and
 * supplies an engine that satisfies these contracts structurally. */
export type EngineLine = {
  multipv: number; depth: number; scoreCp: number | null; mate: number | null; pv: string[];
  scoreProvenance?: { kind: 'root-search' | 'reconciliation-root'; fen: string;
    originatingDepth: number; reportedDepth: number; engineBuild: string };
};
export type PositionAnalysis = EngineLine & {
  bestmove: string; candidates: EngineLine[]; terminal?: boolean; sacrificeVerification?: unknown;
};
/** Classifier-owned finite depth request; hosts may translate it to a UCI
 * client's discriminated search limit without coupling this package to UCI. */
export type SearchRequest = {
  fen: string; depth: number; multiPv?: number; rootMoves?: string[]; signal?: AbortSignal;
};
