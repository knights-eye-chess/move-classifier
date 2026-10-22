# Knight's Eye Move Classifier

Classify chess moves using Knight's Eye's policy and actual engine evidence.
Replay an exact move history, acquire or supply analysis, and receive a move-quality
decision with its policy identity and reasons.

Use it in analysis apps, annotated game viewers or chess tooling. The library has
**zero runtime npm dependencies**: you supply a compatible chess implementation
and, when you want engine analysis, an object that satisfies `AnalysisEngine`.

## What you can build

- Move-quality labels and reason displays for a game or study.
- An analysis service with your own engine hosting and search scheduling.
- A classifier that uses already collected live engine evidence.
- Bounded decision records for historical display in your own storage.

For a ready-made PGN command, see [PGN Annotator](https://github.com/knights-eye-chess/pgn-annotator).

## Get started

Use Node 24 or newer. Install the public prerelease with the chess library used
in this example:

```sh
npm install @knights-eye-chess/move-classifier@next chess.js@1.4.0
```

Pin the resolved exact version for a reproducible install. The policy and API
remain preview contracts. For source
development, use the commands below; [SOURCE-ORIGIN.json](SOURCE-ORIGIN.json)
records historical archive provenance.

This first example deliberately supplies no engine evidence. It shows how to
handle a missing search without presenting a move label:

```js
import { Chess } from 'chess.js';
import { createChessAnalyzerCore } from '@knights-eye-chess/move-classifier/core';
import { createKnightsEyePolicy } from '@knights-eye-chess/move-classifier/policy/knights-eye';

const analyzer = createChessAnalyzerCore(Chess, undefined, createKnightsEyePolicy(Chess));
const result = await analyzer.classifySuppliedEvidence({
  startFen: new Chess().fen(), history: ['e2e4'], depth: 18,
  evidence: []
});
if (result.status === 'complete') {
  console.log(result.decision.classification);
} else {
  console.log(result.reason, result.request); // incomplete-evidence and missing search
}
```

## Supply or acquire analysis

`classifySuppliedEvidence` accepts live position evidence for the required searches.
It never starts an engine. `analyzeAndClassify` uses your injected engine to obtain
missing evidence. Both replay the starting FEN and exact nonempty UCI history to
identify the selected move.

A complete result contains the policy identity, decision and admitted live evidence.
An unavailable result describes the missing evidence, engine failure or cancellation.
Your app can show that state while waiting for analysis. Missing evidence does not
receive a move-quality label.

The classifier checks FEN scope, legal principal variations, achieved depth and
candidate coverage. Scores use the side-to-move perspective; mate distances are
signed moves. Search defaults retain three candidates and depth-10 sacrifice
verification; ordinary searches use the caller's depth. An optional opening lookup
can identify book moves; without it no Book assertion is made.

## API and documentation

| Entry point | Purpose |
| --- | --- |
| `@knights-eye-chess/move-classifier/core` | Replay-based core, supplied-evidence classification and low-level analysis service. |
| `@knights-eye-chess/move-classifier/policy/knights-eye` | Native Knight's Eye policy and its types. |
| `@knights-eye-chess/move-classifier/contracts` | Result/evidence types, policy revision and recorded-decision codecs. |

`@knights-eye-chess/move-classifier/compatibility` exposes the current policy runtime factory and source strings for host compatibility generation. Hosts should use the typed policy factory for new integrations.

`EngineLine`, `PositionAnalysis` and the depth-shaped `SearchRequest` are
classifier-owned structural types exported from `/core` and `/contracts`. There
is no root import and no bundled engine binary, process host or browser Worker.
See [evidence and recording contracts](docs/API.md), [core source](src/chess-analysis/analyze.ts),
[policy source](src/chess-analysis/knights-eye-policy.ts) and [consumer tests](tests).

The preview `/engine/stockfish` export has moved to the separate UCI client.
Hosts that used `createStockfishAdapter` should inject an `AnalysisEngine` whose
`search` translates `depth` to the client's `limit: { depth }`. See
[the migration example](docs/API.md#uci-client-migration). Previously published
prereleases retain their original exports.

Recorded decisions are for display. Restoring a record never turns it into live
engine evidence. Your app owns legal replay on import, storage, opening data,
engine attribution and cache invalidation. Advanced prepared-policy calls return
policy decisions; they do not certify admitted complete analysis outcomes.

## Classification policy 41

A qualifying missed opportunity remains Miss unless it loses more than 20
percentage points of expected outcome and leaves a finite numeric after-outcome
below 0.40. That case is Blunder, retaining the opportunity diagnostic. Missing
after-outcomes preserve Miss. The rule also applies to already-losing positions;
existing higher-priority labels and verified-mate handling remain unchanged.
Recorded policy-40 decisions keep their original identity and are not relabeled.

## Classification policy 43

Mate/cp alternatives in the same winning or losing outcome band use their expected-points gap for uniqueness, just as for move quality. A mate score alongside another completely winning move therefore does not establish an only viable move or award Great. A different played move with a winning centipawn score also bounds uniqueness when the root best is a mate, even if that played move was absent from the root candidates. Genuine outcome gaps and comparisons between two mate scores retain their existing behavior. Saved policy-42 decisions require reclassification.

The played move uses its own before-position root score when available. An
independent child search retains its original values and can trigger one bounded
same-root comparison when the evaluations disagree materially. Same-outcome-band
mate/centipawn format changes use ordinary expected-outcome loss; a legally
verified missed mate-in-one retains its precedence. Policy 41's narrow Miss
severity override is unchanged.

Comparisons are edge-local, require complete legal coverage, and never establish
Great/uniqueness or replace unrestricted rankings. A failed required comparison
returns unavailable so hosts can retain their last completed label without new UI.
See [comparison acquisition](docs/API.md#material-evaluation-conflicts).

## Classification policy 47 candidate

Brilliant requires a near-best move, a real offered piece, and sound engine
outcomes after every enumerated legal acceptance. The board check considers
piece values, attackers and defenders, x-ray batteries, rescues and trapped
pieces. It also permits combinations that create counter-threats. The special
declined-recapture witness enumerates bounded legal forcing replies on the
board and compares their restricted search outcomes with equal recaptures.
The checking-combination witness requires a legal checking reply and an
admitted favorable mate after acceptance. A piece already left capturable on
the mover's previous turn uses the ordinary offer gate; if the opponent's
last move newly attacked it, a bounded legal exchange on every immediate
recovery square must leave a real material deficit. This attribution requires
verified move history. See the [Brilliant policy details](docs/API.md#brilliant-policy-47-candidate).
When the original unrestricted search ranked the move below first, an otherwise
Brilliant move also needs one admitted, same-depth two-root comparison between
the original best and played moves. Missing or refuting comparison evidence
cannot award Brilliant. The service requests this only after the offer proof;
prepared hosts use `brilliantComparison` at the same stage.
The remaining PV material-path calculation belongs only to the legacy
Interesting tier; it is not part of the Brilliant proof.

## Classification policy 48

Non-sacrifice Great moves must retain the existing near-best, outcome, routine,
evasion and normalized uniqueness gates. They additionally need a 0.05 expected-
points swing from the preceding position or a 0.20 uniqueness gap. Quiet moves
(without a capture or check) may instead qualify by preserving a holding outcome
(best at least 0.50, second below 0.45) or decisive conversion (best at least 0.80,
second below 0.72). The same rules evaluate a missed best alternative using that
alternative's own move characteristics. Missing history supplies no swing credit.

Qualification diagnostics record every matching reason and signed distances to
the thresholds, from unrestricted root evidence. Restricted comparisons cannot
create these reasons. Existing Brilliant and Interesting rules are unchanged.
Saved policy-47 labels require reclassification; recorded decisions are never
engine proof. Thresholds remain sensitive to ordinary engine score changes near
a boundary; this revision adds no hysteresis.

## Acknowledgements

The unsafe-piece, trapped-piece and rescue ideas are adapted from the prose
description of [WintrChess](https://github.com/WintrCat/wintrchess). No
WintrChess code or dependency is included; this package remains MIT.

## Development

```sh
npm ci
npm run check
npm run pack:checked
```

Edit the source in this repository. [SOURCE-ORIGIN.json](SOURCE-ORIGIN.json) records
its historical extraction; no application checkout is required to build it.
The checked pack command runs the build and tests before creating an archive.
The real-engine corpus is opt-in: set `KE_CORPUS_ENGINE` to a Stockfish JS entry
point and run `node --test tests/brilliant-corpus.test.mjs`. Its default is
`nodes-admit` with a 2,000,000-node cap, requested depth 15, one thread and
16 MiB hash, isolated per fixture. Reached-depth evidence still passes through
the unchanged policy gates. This is a manual qualification gate (about 20 minutes
on the measured quiet executor), not an ordinary PR check.
See the [qualification record](docs/research/corpus-acquisition-budget.md) for
the pinned engine hashes, complete quiet/contention results and limitations.
Set `KE_CORPUS_BUDGET_MODE=wall` for the three-second negative control;
`nodes` retains strict requested-depth admission as a diagnostic.
`KE_CORPUS_DEPTH` and `KE_CORPUS_NODE_LIMIT` permit explicit experiments; changing
the engine artifacts, depth, cap, threads or hash requires requalification.

See [npm publishing](NPM-PUBLISHING.md) for release preparation.

## License

First-party code is **[MIT](LICENSE)**. See [licensing details](LICENSING.md) and
[third-party notices](THIRD_PARTY_NOTICES.md).
