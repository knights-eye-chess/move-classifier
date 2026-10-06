/** A detached display record. It contains no engine search or reusable evidence. */
export const RECORDED_DECISION_SCHEMA = 'classifier-decision/1' as const;

export type PolicyIdentity = Readonly<{ id: string; revision: number }>;
export type CandidateOriginKind =
  | 'root-search' | 'multipv-derived' | 'subsequent-position'
  | 'terminal-position' | 'legacy-unknown' | 'restored-fallback';
export type RecordedCandidateOrigin = Readonly<{
  kind: CandidateOriginKind;
  fen?: string | null;
  engineBuild?: string | null;
  originatingDepth?: number | null;
  reportedDepth?: number | null;
}>;
export type RecordedOccurrence = Readonly<{
  startFen: string;
  history: readonly string[];
  beforeFen: string;
  afterFen: string;
  moveUci: string;
}>;
export type RecordedDecision = Readonly<{
  schema: typeof RECORDED_DECISION_SCHEMA;
  policy: PolicyIdentity;
  /** Optional identity of the rule that selected this decision among sources. */
  selectionPolicy?: PolicyIdentity;
  occurrence: RecordedOccurrence;
  label: string;
  reasonCodes: readonly string[];
  summary?: string;
  candidateOrigins: readonly Readonly<{ uci: string; origin: RecordedCandidateOrigin }>[];
}>;
export type RecordedDecisionRead =
  | Readonly<{ status: 'supported'; record: RecordedDecision; displayOnly: true; reusableAsEngineEvidence: false }>
  | Readonly<{ status: 'historical-revision'; relation: 'older' | 'newer'; record: RecordedDecision; displayOnly: true; reusableAsEngineEvidence: false }>
  | Readonly<{ status: 'foreign-policy'; record: RecordedDecision; displayOnly: true; reusableAsEngineEvidence: false }>
  | Readonly<{ status: 'unsupported-schema' | 'invalid'; record: null; displayOnly: true; reusableAsEngineEvidence: false }>;

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const IDENTIFIER = /^[a-z][a-z0-9._:/-]*$/i;
const ORIGIN_KINDS = new Set<CandidateOriginKind>([
  'root-search', 'multipv-derived', 'subsequent-position',
  'terminal-position', 'legacy-unknown', 'restored-fallback',
]);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected a record object.');
  return value as Record<string, unknown>;
}
function string(value: unknown, name: string, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError(`Invalid ${name}.`);
  }
  return value;
}
function identity(value: unknown, name: string): PolicyIdentity {
  const raw = object(value);
  const id = string(raw.id, `${name} id`, 128);
  if (!IDENTIFIER.test(id) || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1) {
    throw new TypeError(`Invalid ${name}.`);
  }
  return Object.freeze({ id, revision: Number(raw.revision) });
}
function fen(value: unknown, name: string): string { return string(value, name, 200); }
function uci(value: unknown, name: string): string {
  const move = string(value, name, 5);
  if (!UCI.test(move)) throw new TypeError(`Invalid ${name}.`);
  return move;
}
function optionalText(value: unknown, name: string, limit: number): string | undefined {
  return value === undefined ? undefined : string(value, name, limit);
}
function optionalOriginText(value: unknown, name: string): string | null | undefined {
  return value == null ? value as null | undefined : string(value, name, 200);
}
function optionalDepth(value: unknown, name: string): number | null | undefined {
  if (value == null) return value as null | undefined;
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new TypeError(`Invalid ${name}.`);
  return Number(value);
}
function origin(value: unknown): RecordedCandidateOrigin {
  const raw = object(value);
  if (!ORIGIN_KINDS.has(raw.kind as CandidateOriginKind)) throw new TypeError('Invalid candidate origin kind.');
  const fenValue = optionalOriginText(raw.fen, 'origin FEN');
  const build = optionalOriginText(raw.engineBuild, 'engine build');
  const originatingDepth = optionalDepth(raw.originatingDepth, 'originating depth');
  const reportedDepth = optionalDepth(raw.reportedDepth, 'reported depth');
  return Object.freeze({ kind: raw.kind as CandidateOriginKind,
    ...(fenValue !== undefined ? { fen: fenValue } : {}),
    ...(build !== undefined ? { engineBuild: build } : {}),
    ...(originatingDepth !== undefined ? { originatingDepth } : {}),
    ...(reportedDepth !== undefined ? { reportedDepth } : {}),
  });
}

/** Validates the wire shape and freezes a whitelist copy, never the caller's data.
 * Legal replay and FEN transitions remain the host's responsibility. A legacy
 * dataset-v2 classifier number cannot supply the required policy identity. */
export function recordDecision(value: unknown): RecordedDecision {
  const raw = object(value);
  if (raw.schema !== RECORDED_DECISION_SCHEMA) throw new TypeError('Unsupported recorded decision schema.');
  const policy = identity(raw.policy, 'classification policy');
  const selectionPolicy = raw.selectionPolicy === undefined ? undefined : identity(raw.selectionPolicy, 'selection policy');
  const source = object(raw.occurrence);
  if (!Array.isArray(source.history) || source.history.length < 1 || source.history.length > 4096) {
    throw new TypeError('Invalid move history.');
  }
  const history = Object.freeze(source.history.map((move, index) => uci(move, `history move ${index + 1}`)));
  const moveUci = uci(source.moveUci, 'move UCI');
  if (history[history.length - 1] !== moveUci) throw new TypeError('Move UCI does not match history.');
  const occurrence = Object.freeze({ startFen: fen(source.startFen, 'start FEN'), history,
    beforeFen: fen(source.beforeFen, 'before FEN'), afterFen: fen(source.afterFen, 'after FEN'), moveUci });
  const label = string(raw.label, 'label', 80);
  if (!Array.isArray(raw.reasonCodes) || raw.reasonCodes.length > 16) throw new TypeError('Invalid reason codes.');
  const reasonCodes = Object.freeze(raw.reasonCodes.map((reason, index) => {
    const code = string(reason, `reason code ${index + 1}`, 80);
    if (!IDENTIFIER.test(code)) throw new TypeError(`Invalid reason code ${index + 1}.`);
    return code;
  }));
  const summary = optionalText(raw.summary, 'summary', 1000);
  const candidates = raw.candidateOrigins === undefined ? [] : raw.candidateOrigins;
  if (!Array.isArray(candidates) || candidates.length > 3) throw new TypeError('Invalid candidate origins.');
  const candidateOrigins = Object.freeze(candidates.map(item => {
    const candidate = object(item);
    return Object.freeze({ uci: uci(candidate.uci, 'candidate UCI'), origin: origin(candidate.origin) });
  }));
  return Object.freeze({ schema: RECORDED_DECISION_SCHEMA, policy,
    ...(selectionPolicy ? { selectionPolicy } : {}), occurrence, label, reasonCodes,
    ...(summary !== undefined ? { summary } : {}), candidateOrigins });
}

/** Every result is a historical display snapshot, even for the exact policy. */
export function readRecordedDecision(value: unknown, supportedPolicy: unknown): RecordedDecisionRead {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.freeze({ status: 'invalid', record: null, displayOnly: true, reusableAsEngineEvidence: false });
  if ((value as Record<string, unknown>).schema !== RECORDED_DECISION_SCHEMA) {
    return Object.freeze({ status: 'unsupported-schema', record: null, displayOnly: true, reusableAsEngineEvidence: false });
  }
  try {
    const supported = identity(supportedPolicy, 'supported policy');
    const record = recordDecision(value);
    if (record.policy.id !== supported.id) return Object.freeze({ status: 'foreign-policy', record, displayOnly: true, reusableAsEngineEvidence: false });
    if (record.policy.revision !== supported.revision) return Object.freeze({ status: 'historical-revision',
      relation: record.policy.revision < supported.revision ? 'older' : 'newer', record, displayOnly: true, reusableAsEngineEvidence: false });
    return Object.freeze({ status: 'supported', record, displayOnly: true, reusableAsEngineEvidence: false });
  } catch {
    return Object.freeze({ status: 'invalid', record: null, displayOnly: true, reusableAsEngineEvidence: false });
  }
}
