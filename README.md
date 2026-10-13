# Knight's Eye Move Classifier

Classify chess moves using Knight's Eye's policy and actual engine evidence.
Replay an exact move history, acquire or supply analysis, and receive a move-quality
decision with its policy identity and reasons.

Use it in analysis apps, annotated game viewers or chess tooling. The library has
**zero runtime npm dependencies**: you supply a compatible chess implementation
and, when you want engine analysis, an engine port.

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

The `next` tag currently resolves to `0.1.0-dev.10`; pin that exact version for a
reproducible install. The policy and API remain preview contracts. For source
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
| `@knights-eye-chess/move-classifier/engine/stockfish` | UCI adapter for a host-supplied transport. |
| `@knights-eye-chess/move-classifier/contracts` | Result/evidence types, policy revision and recorded-decision codecs. |

`@knights-eye-chess/move-classifier/compatibility` exposes the current policy runtime factory and source strings for host compatibility generation. Hosts should use the typed policy factory for new integrations.

There is no root import and no bundled engine binary, process host or browser Worker.
See [evidence and recording contracts](docs/API.md), [core source](src/chess-analysis/analyze.ts),
[policy source](src/chess-analysis/knights-eye-policy.ts) and [consumer tests](tests).

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

## Classification policy 42

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

## Development

```sh
npm ci
npm run check
npm run pack:checked
```

Edit the source in this repository. [SOURCE-ORIGIN.json](SOURCE-ORIGIN.json) records
its historical extraction; no application checkout is required to build it.
The checked pack command runs the build and tests before creating an archive.

See [npm publishing](NPM-PUBLISHING.md) for release preparation.

## License

First-party code is **[MIT](LICENSE)**. See [licensing details](LICENSING.md) and
[third-party notices](THIRD_PARTY_NOTICES.md).
