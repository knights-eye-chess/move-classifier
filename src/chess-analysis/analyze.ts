import type { PositionAnalysis, SearchRequest } from './analysis-types';
import { DEFAULT_SEARCH_POLICY } from './contracts';
import type { AnalysisContext, AnalysisEngine, AnalysisLogic, AnalysisOutcome, AnalysisPolicy, CandidateMove, ChessAnalyzerOptions, ChessConstructor, ChessMove, ClassificationDecision, ExactAnalysisRequest, LivePosition, SearchPolicy, SuppliedAnalysisRequest, SuppliedPositionEvidence, Unavailable, UnavailableReason } from './contracts';
export * from './contracts';

class AdmissionError extends Error {
  constructor(readonly reason: UnavailableReason, message: string, readonly request?: Unavailable['request']) { super(message); }
}
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
function fail(reason: UnavailableReason, message: string, request?: Unavailable['request']): never { throw new AdmissionError(reason, message, request); }
function check(signal?: AbortSignal) { if (signal?.aborted) fail('cancelled', 'Analysis cancelled.'); }
function searchSettings(value: SearchPolicy = DEFAULT_SEARCH_POLICY): SearchPolicy {
  if (!Number.isInteger(value.candidateCount) || value.candidateCount < 1 || value.candidateCount > 218 || !Number.isInteger(value.verificationDepth) || value.verificationDepth < 1 || value.verificationDepth > 128) fail('invalid-request', 'Invalid search policy.');
  return { ...value };
}
function unavailable(error: AdmissionError): Unavailable { return { status: 'unavailable', reason: error.reason, message: error.message, ...(error.request ? { request: error.request } : {}) }; }
const key = (fen: string, roots?: readonly string[]) => JSON.stringify([fen, roots ? [...roots].sort() : null]);

/** Copies admitted score/PV data only. Saved verification objects and display
 * metadata are never accepted as proof. Scores are from the side to move;
 * mate is signed mate-in-moves, not plies. */
function admit<V>(value: PositionAnalysis, request: NonNullable<Unavailable['request']>, legalPv?: (fen: string, pv: readonly string[]) => boolean): LivePosition<V> {
  if (!value || typeof value !== 'object' || value.terminal || !Array.isArray(value.candidates) || value.candidates.length < request.multiPv || !Number.isInteger(value.depth) || value.depth < request.depth) fail('incomplete-evidence', 'Position evidence did not meet requested depth and coverage.', request);
  const seen = new Set<string>();
  const candidates = value.candidates.map((line, index) => {
    if (!line || 'lowerbound' in line && line.lowerbound || 'upperbound' in line && line.upperbound || line.multipv !== index + 1 || !Number.isInteger(line.depth) || line.depth < request.depth || !Array.isArray(line.pv) || !line.pv.length || line.pv.length > 512 || line.pv.some(move => typeof move !== 'string' || !UCI.test(move)) || seen.has(line.pv[0])) fail('incomplete-evidence', 'Invalid candidate evidence.', request);
    const cp = line.scoreCp, mate = line.mate;
    if (!((typeof cp === 'number' && Number.isFinite(cp) && mate === null) || (cp === null && Number.isInteger(mate) && mate !== 0))) fail('incomplete-evidence', 'Candidate requires exactly one finite score.', request);
    if (request.rootMoves && !request.rootMoves.includes(line.pv[0]) || legalPv && !legalPv(request.fen, line.pv)) fail('incomplete-evidence', 'Candidate PV does not match the requested position or roots.', request);
    if (line.scoreProvenance && (line.scoreProvenance.fen !== request.fen || line.scoreProvenance.kind === 'reconciliation-root' && !request.rootMoves)) fail('incomplete-evidence', 'Candidate origin does not match the requested position.', request);
    seen.add(line.pv[0]);
    return { multipv: line.multipv, depth: line.depth, scoreCp: cp, mate, pv: [...line.pv], ...(line.scoreProvenance ? { scoreProvenance: { ...line.scoreProvenance } } : {}) };
  });
  if (request.rootMoves && request.rootMoves.some(root => !seen.has(root)) || value.bestmove !== candidates[0].pv[0] || value.scoreCp !== candidates[0].scoreCp || value.mate !== candidates[0].mate || value.depth > Math.min(...candidates.map(line => line.depth))) fail('incomplete-evidence', 'Inconsistent root evidence.', request);
  return { ...candidates[0], depth: Math.min(...candidates.map(line => line.depth)), bestmove: candidates[0].pv[0], candidates };
}

/** Shared engine-backed/supplied-evidence orchestration. Policy exceptions remain
 * exceptions; acquisition failures and missing inputs are explicit outcomes. */
export function createAnalysisService<D extends ClassificationDecision, X, V, C extends CandidateMove>(
  logic: AnalysisLogic<D,X,V,C>, engine?: AnalysisEngine,
  cache?: { get(fen: string): PositionAnalysis | null; put(fen: string, result: PositionAnalysis): void; generation?(): number },
  options: { searchPolicy?: SearchPolicy; legalPv?: (fen: string, pv: readonly string[]) => boolean } = {},
) {
  // Survives request-local policy forks; one attempt per occurrence and epoch.
  const comparisons = new Map<string, PositionAnalysis | null>();
  const pairAttempts = new Map<string, symbol>();
  let comparisonGeneration = cache?.generation?.();
  async function run(request: { comparisonKey?: string; context: AnalysisContext<X,V>; depth: number; signal?: AbortSignal; evidence?: readonly SuppliedPositionEvidence[]; suppliedOnly?: boolean }): Promise<AnalysisOutcome<D,X,V>> {
    try {
      const cacheGeneration = cache?.generation?.();
      if (comparisonGeneration !== cacheGeneration) { comparisons.clear(); pairAttempts.clear(); comparisonGeneration = cacheGeneration; }
      const cacheCurrent = () => cacheGeneration === cache?.generation?.();
      const activeLogic = logic.fork?.() || logic;
      activeLogic.resetEvidence?.();
      check(request.signal);
      if (!activeLogic.identity || typeof activeLogic.identity.id !== 'string' || !activeLogic.identity.id.trim() || !Number.isSafeInteger(activeLogic.identity.revision) || activeLogic.identity.revision < 1) fail('invalid-request', 'Invalid classification policy identity.');
      if (!Number.isInteger(request.depth) || request.depth < 1 || request.depth > 128) fail('invalid-request', 'Invalid analysis depth.');
      const settings = searchSettings(options.searchPolicy), context = { ...request.context };
      delete context.comparisonAnalysis; // Only admitted comparison envelopes or this service's cache are proof.
      const supplied = new Map<string, PositionAnalysis>();
      for (const item of request.evidence || []) {
        if (!item || item.kind !== 'live-position' || typeof item.fen !== 'string' || (item.rootMoves && (!Array.isArray(item.rootMoves) || !item.rootMoves.length || item.rootMoves.some(root => !UCI.test(root)) || new Set(item.rootMoves).size !== item.rootMoves.length))) fail('invalid-request', 'Invalid supplied evidence envelope.');
        const evidenceKey = key(item.fen, item.rootMoves);
        if (supplied.has(evidenceKey)) fail('invalid-request', 'Duplicate supplied evidence scope.');
        supplied.set(evidenceKey, item.analysis);
      }
      async function position(fen: string, roots?: string[], requiredDepth?: number): Promise<LivePosition<V>> {
        check(request.signal);
        const depth = roots ? (requiredDepth ?? settings.verificationDepth) : request.depth;
        const terminal = activeLogic.terminal(fen, depth);
        if (terminal && !roots) return { ...terminal, candidates: [], pv: [] } as LivePosition<V>;
        const legal = activeLogic.legalCount(fen);
        if (!Number.isInteger(legal) || legal < 1) fail('invalid-request', 'Policy did not identify a valid nonterminal position.');
        const multiPv = roots ? roots.length : Math.min(settings.candidateCount, legal);
        const needed = { fen, depth, multiPv, ...(roots ? { rootMoves: roots } : {}) };
        const suppliedValue = supplied.get(key(fen, roots));
        if (suppliedValue) return admit<V>(suppliedValue, needed, options.legalPv);
        if (!roots && !request.suppliedOnly && cacheCurrent()) {
          const cached = cache?.get(fen);
          if (cached) { try { return admit<V>(cached, needed, options.legalPv); } catch (error) { if (!(error instanceof AdmissionError)) throw error; } }
        }
        if (request.suppliedOnly) fail('incomplete-evidence', 'Required supplied live evidence is missing.', needed);
        if (!engine) fail('engine-unavailable', 'Required live evidence is missing and no engine acquisition is available.', needed);
        if (engine.capabilities && (multiPv > 1 && !engine.capabilities.multiPv || roots && !engine.capabilities.rootMoves)) fail('unsupported-capability', 'Engine does not support the required search capability.', needed);
        let found: PositionAnalysis;
        try { found = await engine.search({ ...needed, signal: request.signal } as SearchRequest); }
        catch { check(request.signal); fail('engine-failure', 'Engine search failed.', needed); }
        check(request.signal);
        const result = admit<V>(found, needed, options.legalPv);
        if (!roots && cacheCurrent()) cache?.put(fen, admit<V>(result, needed));
        return result;
      }
      const prior = context.priorFen ? await position(context.priorFen) : null;
      const before = await position(context.beforeFen), after = await position(context.afterFen);
      context.beforeAnalysis = before; context.afterAnalysis = after;
      context.priorEp = prior ? activeLogic.priorPoints(prior) : null;
      check(request.signal);
      const comparisonKey = request.comparisonKey || JSON.stringify([context.beforeFen, context.move.uci, context.afterFen]);
      const cachedComparison = !request.suppliedOnly && comparisons.get(comparisonKey);
      if (cachedComparison) context.comparisonAnalysis = structuredClone(cachedComparison);
      const callerComparison = !request.suppliedOnly && request.context.comparisonAnalysis;
      if (callerComparison && activeLogic.admitClassificationComparison) {
        const hasPlayed = before.candidates.some(line => line.pv[0] === context.move.uci);
        // A deeper unrestricted search already supersedes this settled proof.
        if (!(hasPlayed && before.depth > callerComparison.depth)) {
          const roots = Array.isArray(callerComparison.candidates) ? callerComparison.candidates.map(line => line?.pv?.[0]) : [];
          const needed = { fen: context.beforeFen, depth: callerComparison.depth, multiPv: roots.length, rootMoves: roots };
          if (!Number.isSafeInteger(needed.depth) || needed.depth<1 || roots.length<1 || roots.length>3 || roots.some(root => typeof root!=='string' || !UCI.test(root)) ||
            !roots.includes(context.move.uci) || !roots.includes(before.bestmove) || new Set(roots).size!==roots.length) fail('incomplete-evidence', 'Invalid caller comparison scope.');
          const generic = admit<V>(callerComparison, needed, options.legalPv);
          const admitted = activeLogic.admitClassificationComparison(context, needed, generic);
          if (!admitted) fail('incomplete-evidence', 'Caller comparison failed policy admission.', needed);
          context.comparisonAnalysis = admitted;
          comparisons.set(comparisonKey, structuredClone(admitted));
        }
      }
      const neededComparison = activeLogic.classificationComparison?.(context);
      if (neededComparison) {
        const needed = neededComparison;
        if (needed.fen !== context.beforeFen || !Number.isSafeInteger(needed.depth) || needed.depth < 1 || !Array.isArray(needed.rootMoves) ||
          needed.multiPv !== needed.rootMoves.length || !needed.rootMoves.length || !needed.rootMoves.includes(context.move.uci) ||
          needed.rootMoves.some(root => !UCI.test(root)) || new Set(needed.rootMoves).size !== needed.rootMoves.length) fail('invalid-request', 'Invalid classification comparison scope.');
        let found = supplied.get(key(needed.fen, needed.rootMoves));
        if (!found) {
          if (request.suppliedOnly) fail('incomplete-evidence', 'Required classification comparison is missing.', needed);
          if (comparisons.has(comparisonKey)) fail('comparison-unavailable', 'Classification comparison already attempted in this evidence generation.', needed);
          comparisons.set(comparisonKey, null);
          if (!engine) fail('engine-unavailable', 'Classification comparison requires engine evidence.', needed);
          if (engine.capabilities && (!engine.capabilities.rootMoves || needed.multiPv > 1 && !engine.capabilities.multiPv)) fail('unsupported-capability', 'Engine cannot compare the required moves.', needed);
          try { found = await engine.search({ ...needed, signal: request.signal }); }
          catch { check(request.signal); fail('engine-failure', 'Classification comparison failed.', needed); }
        }
        check(request.signal);
        if (!cacheCurrent()) fail('cancelled', 'Classification comparison context expired.', needed);
        let comparison: PositionAnalysis = admit<V>(found, needed, options.legalPv);
        if (comparison.candidates.length !== needed.multiPv) fail('incomplete-evidence', 'Classification comparison coverage differs from requested roots.', needed);
        if (activeLogic.admitClassificationComparison) {
          const admitted = activeLogic.admitClassificationComparison(context, needed, comparison);
          if (!admitted) fail('incomplete-evidence', 'Classification comparison failed policy admission.', needed);
          comparison = admitted;
        }
        context.comparisonAnalysis = comparison;
        if (!request.suppliedOnly) comparisons.set(comparisonKey, structuredClone(comparison));
      }
      const exchange = activeLogic.exchange(context), offer = activeLogic.offer(context, after, exchange.inherited ? exchange.originFen : '');
      let verification = offer.verification;
      if (offer.candidates.length && (!verification || !activeLogic.verificationSatisfies(verification, settings.verificationDepth))) {
        const roots = offer.candidates.map(candidate => candidate.uci);
        if (roots.some(root => !UCI.test(root)) || new Set(roots).size !== roots.length) fail('invalid-request', 'Policy requested invalid verification roots.');
        const verified = await position(context.afterFen, roots);
        check(request.signal); verification = activeLogic.verify(context, offer, verified.candidates);
        if (!verification || !activeLogic.verificationSatisfies(verification, settings.verificationDepth)) fail('verification-unavailable', 'Policy could not verify the requested continuations.');
      }
      if (verification && activeLogic.continuationRequests && activeLogic.verifyContinuations) {
        const scopes = activeLogic.continuationRequests(context, offer, verification);
        const evidence = [];
        for (const scope of scopes) {
          if (!scope || typeof scope.fen !== 'string' || !scope.fen.trim() || !Array.isArray(scope.rootMoves) || !scope.rootMoves.length ||
            !Number.isSafeInteger(scope.depth) || scope.depth < settings.verificationDepth || scope.depth > 128 ||
            scope.rootMoves.some(root => !UCI.test(root)) || new Set(scope.rootMoves).size !== scope.rootMoves.length ||
            typeof scope.acceptanceUci !== 'string' || !offer.candidates.some(candidate => candidate.uci === scope.acceptanceUci))
            fail('invalid-request', 'Policy requested an invalid continuation scope.');
          check(request.signal);
          evidence.push({ request: scope, analysis: await position(scope.fen, scope.rootMoves, scope.depth) });
        }
        if (scopes.length) {
          verification = activeLogic.verifyContinuations(context, offer, verification, evidence);
          if (!verification || !activeLogic.verificationSatisfies(verification, settings.verificationDepth))
            fail('verification-unavailable', 'Policy could not verify the declined-recapture continuations.');
        }
      }
      if (verification) after.sacrificeVerification = verification;
      // A non-first move that otherwise earns Brilliant needs one coherent,
      // same-depth comparison of the original best root with the played root.
      // This is a separate stage from ordinary score reconciliation: its
      // request is known only after the material acceptance proof is complete.
      check(request.signal);
      const neededPair = activeLogic.brilliantComparison?.(context);
      if (neededPair) {
        if (!cacheCurrent()) fail('cancelled', 'Brilliant comparison context expired.', neededPair);
        if (neededPair.fen !== context.beforeFen || !Number.isSafeInteger(neededPair.depth) || neededPair.depth < 1 ||
          neededPair.multiPv !== 2 || !Array.isArray(neededPair.rootMoves) || neededPair.rootMoves.length !== 2 ||
          neededPair.rootMoves[0] !== before.bestmove || neededPair.rootMoves[1] !== context.move.uci ||
          neededPair.rootMoves.some(root => !UCI.test(root)))
          fail('invalid-request', 'Policy requested an invalid Brilliant comparison scope.');
        const pairKey = JSON.stringify([comparisonKey, 'brilliant-pair', neededPair.depth, neededPair.rootMoves]);
        let pair = !request.suppliedOnly ? comparisons.get(pairKey) : null;
        if (!pair && (request.suppliedOnly || !pairAttempts.has(pairKey))) {
          const attempt = Symbol('brilliant-pair-attempt');
          if (!request.suppliedOnly) pairAttempts.set(pairKey, attempt);
          try {
            pair = await position(neededPair.fen, neededPair.rootMoves, neededPair.depth);
            check(request.signal);
            if (!cacheCurrent()) fail('cancelled', 'Brilliant comparison context expired.', neededPair);
          }
          catch (error) {
            if (!(error instanceof AdmissionError) || error.reason === 'cancelled') {
              if (pairAttempts.get(pairKey) === attempt) pairAttempts.delete(pairKey);
              throw error;
            }
            // Missing or short pair evidence withholds optional Brilliant credit;
            // it does not erase an otherwise complete ordinary classification.
          }
        }
        const admitted = pair && activeLogic.admitClassificationComparison?.(context, neededPair, pair);
        if (admitted) {
          context.comparisonAnalysis = admitted;
          if (!request.suppliedOnly) comparisons.set(pairKey, structuredClone(admitted));
        }
      }
      check(request.signal);
      const decision = activeLogic.classify(context);
      if (!decision || typeof decision.classification !== 'string' || !decision.classification) throw new TypeError('Policy returned an invalid classification decision.');
      return { status: 'complete', policy: { ...activeLogic.identity }, decision, before, after, context };
    } catch (error) { if (error instanceof AdmissionError) return unavailable(error); throw error; }
  }
  let queue: Promise<unknown> = Promise.resolve();
  return { analyzeAndClassify(request: Parameters<typeof run>[0]) {
    const next = queue.then(() => run(request));
    queue = next.then(() => undefined, () => undefined);
    return next;
  } };
}

export function createChessAnalyzerCore<D extends ClassificationDecision, X, V, C extends CandidateMove>(Chess: ChessConstructor, engine: AnalysisEngine | undefined, logic: AnalysisPolicy<D,X,V,C>, options: ChessAnalyzerOptions = {}) {
  const evidence = new Map<string, PositionAnalysis>();
  let generation = 0;
  const legalPv = (fen: string, pv: readonly string[]) => {
    try { const chess = new Chess(fen); for (const move of pv) if (!chess.move({ from: move.slice(0,2), to: move.slice(2,4), ...(move[4] ? { promotion: move[4] } : {}) })) return false; return true; } catch { return false; }
  };
  const service = createAnalysisService(logic, engine, { generation: () => generation, get: fen => evidence.get(fen) || null, put: (fen, result) => { evidence.set(fen, result); } }, { searchPolicy: options.searchPolicy, legalPv });
  async function analyze(request: ExactAnalysisRequest & { evidence?: readonly SuppliedPositionEvidence[] }, suppliedOnly: boolean): Promise<AnalysisOutcome<D,X,V>> {
    try {
      check(request.signal);
      if (!request.history?.length || request.history.length > 4096) fail('invalid-request', 'Move classification requires an exact nonempty history.');
      let chess: InstanceType<ChessConstructor>;
      try { chess = new Chess(request.startFen); } catch { fail('invalid-request', 'Invalid starting position.'); }
      const fens = [chess.fen()], moves: ChessMove[] = [];
      let exchange: X | null = null, previousExchange: X | null = null;
      for (const uci of request.history) {
        check(request.signal);
        if (typeof uci !== 'string' || !UCI.test(uci)) fail('invalid-request', 'Invalid UCI history.');
        const before = chess.fen(); let played: Omit<ChessMove,'uci'> | null;
        try { played = chess.move({ from: uci.slice(0,2), to: uci.slice(2,4), ...(uci[4] ? { promotion: uci[4] } : {}) }); } catch { fail('invalid-request', 'Illegal move history.'); }
        if (!played) fail('invalid-request', 'Illegal move history.');
        const move = { ...played, uci }; previousExchange = exchange; exchange = logic.materialExchangeForMove(move, before, exchange); moves.push(move); fens.push(chess.fen());
      }
      const index = moves.length - 1;
      const book = request.book ?? Boolean(options.openingLookup?.({ startFen: fens[0], history: [...request.history], afterFen: fens[index+1] }));
      return service.analyzeAndClassify({ comparisonKey: JSON.stringify([fens[0], request.history]), context: { move: moves[index], previousMove: moves[index-1] || null, beforeFen: fens[index], afterFen: fens[index+1], priorFen: fens[index-1] || '', priorOwnBeforeFen: fens[index-2] || '', previousMaterialExchange: previousExchange, book }, depth: request.depth, signal: request.signal, evidence: suppliedOnly ? request.evidence : undefined, suppliedOnly });
    } catch (error) { if (error instanceof AdmissionError) return unavailable(error); throw error; }
  }
  return { analyzeAndClassify: (request: ExactAnalysisRequest) => analyze(request, false), classifySuppliedEvidence: (request: SuppliedAnalysisRequest) => analyze(request, true), clearEvidence() { generation++; evidence.clear(); logic.resetEvidence?.(); } };
}

/** Uses exactly the same replay/admission/decision path, with acquisition disabled. */
export function classifySuppliedEvidence<D extends ClassificationDecision, X, V, C extends CandidateMove>(Chess: ChessConstructor, policy: AnalysisPolicy<D,X,V,C>, request: SuppliedAnalysisRequest, options: ChessAnalyzerOptions = {}) {
  return createChessAnalyzerCore(Chess, undefined, policy, options).classifySuppliedEvidence(request);
}
