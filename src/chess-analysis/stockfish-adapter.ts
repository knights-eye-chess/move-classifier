/** `mate` is Stockfish's signed mate-in-moves score, not a count of plies. */
export type EngineLine = { multipv: number; depth: number; scoreCp: number | null; mate: number | null; pv: string[]; scoreProvenance?: { kind: "root-search"; fen: string; originatingDepth: number; reportedDepth: number; engineBuild: string } };
export type PositionAnalysis = EngineLine & { bestmove: string; candidates: EngineLine[]; terminal?: boolean; sacrificeVerification?: unknown };
export type SearchRequest = { fen: string; depth: number; multiPv?: number; rootMoves?: string[]; signal?: AbortSignal };
export type EnginePort = { postMessage(command: string): void; terminate(): void };
export type EngineAcquire = (label: string, onData: (line: string) => void) => EnginePort;

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
function validUciMove(move: string) {
  return UCI_MOVE.test(move) && move.slice(0, 2) !== move.slice(2, 4) &&
    (move.length === 4 || move[3] === '1' || move[3] === '8');
}

/** UCI transport adapter for a Worker, process, or engine pool. Only complete,
 * scored, syntactically valid root lines become analysis results. The host still
 * owns engine identity and legal replay; this adapter has no chess rules. */
export function createStockfishAdapter(acquire: EngineAcquire, timeoutMs = 65000, engineBuild = "Stockfish") {
  return { search(request: SearchRequest): Promise<PositionAnalysis> {
    const count = request.multiPv ?? 1;
    const roots = request.rootMoves ?? [];
    if (typeof request.fen !== 'string' || !request.fen.trim() || !Number.isSafeInteger(request.depth) || request.depth < 1 ||
      !Number.isSafeInteger(count) || count < 1 || count > 256 ||
      !Array.isArray(roots) || roots.length > 256 || roots.some(move => !validUciMove(move)) ||
      new Set(roots).size !== roots.length || (roots.length > 0 && roots.length !== count) ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !engineBuild) {
      return Promise.reject(new Error('Invalid Stockfish search request.'));
    }
    return new Promise((resolve, reject) => {
      let port: EnginePort | null = null, done = false, ready = false, frameReady = false;
      const found: Record<number, EngineLine> = {};
      const timer = setTimeout(() => finish(new Error('Stockfish analysis timed out.')), timeoutMs);
      const abort = () => finish(new Error('Analysis cancelled.'));
      function finish(error?: Error, bestmove?: string) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', abort);
        try { port?.terminate(); } catch { /* Settlement still belongs to this request. */ }
        if (error) { reject(error); return; }
        const candidates = Array.from({ length: count }, (_, index) => found[index + 1]);
        const complete = candidates.every(line => line && line.depth >= request.depth && line.pv.length > 0 &&
          (line.scoreCp !== null || line.mate !== null));
        const covered = complete && new Set(candidates.map(line => line.pv[0])).size === count &&
          (!roots.length || candidates.every(line => roots.includes(line.pv[0])) && roots.every(root => candidates.some(line => line.pv[0] === root)));
        if (!covered || !bestmove || !validUciMove(bestmove) || candidates[0].pv[0] !== bestmove) {
          reject(new Error('Stockfish did not complete requested depth, score and root coverage.'));
          return;
        }
        const root = candidates[0];
        resolve({ ...root, depth: Math.min(...candidates.map(line => line.depth)), bestmove, candidates });
      }
      if (request.signal?.aborted) { abort(); return; }
      request.signal?.addEventListener('abort', abort, { once: true });
      try {
        port = acquire('Chat move analysis', text => {
          if (done) return;
          try {
          if (text.startsWith('engineerror ')) { finish(new Error(text.slice(12))); return; }
          if (text === 'frame-ready') {
            frameReady = true;
            port?.postMessage('uci');
          } else if (text === 'uciok') {
            port?.postMessage('setoption name MultiPV value ' + count);
            port?.postMessage('isready');
          } else if (text === 'readyok' && !ready) {
            ready = true;
            port?.postMessage('position fen ' + request.fen);
            port?.postMessage('go depth ' + request.depth + (roots.length ? ' searchmoves ' + roots.join(' ') : ''));
          } else if (text.startsWith('info ') && text.includes(' pv ')) {
            const depthMatch = /\bdepth (\d+)\b/.exec(text);
            const multiMatch = /\bmultipv (\d+)\b/.exec(text);
            const scores = Array.from(text.matchAll(/\bscore (cp|mate) (-?\d+)(?=\s|$)/g));
            const pvMatch = /\bpv\s+(.+)$/.exec(text);
            const depth = Number(depthMatch?.[1] ?? NaN);
            const index = multiMatch ? Number(multiMatch[1]) : 1;
            const score = scores.length === 1 ? Number(scores[0][2]) : null;
            const pv = pvMatch?.[1].trim().split(/\s+/) || [];
            if (!Number.isSafeInteger(depth) || depth < 1 || !Number.isSafeInteger(index) || index < 1 || index > count ||
              score === null || !Number.isSafeInteger(score) || !pv.length || pv.some(move => !validUciMove(move)) ||
              /\b(?:lowerbound|upperbound)\b/.test(text)) return;
            const line: EngineLine = { multipv: index, depth, scoreCp: scores[0][1] === 'cp' ? score : null,
              mate: scores[0][1] === 'mate' ? score : null, pv,
              scoreProvenance: { kind: 'root-search', fen: request.fen, originatingDepth: depth, reportedDepth: depth, engineBuild } };
            if (!found[index] || found[index].depth <= depth) found[index] = line;
          } else if (text.startsWith('bestmove')) {
            finish(undefined, /^bestmove\s+(\S+)/.exec(text)?.[1]);
          }
          } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
        });
        if (done) {
          try { port.terminate(); } catch { /* Already settled by synchronous transport output. */ }
          return;
        }
        if (frameReady && !done) port.postMessage('uci');
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    });
  } };
}
