# Private reusable classification preview

First-party code: **MIT**. See [LICENSING.md](LICENSING.md) for scope and third-party terms.

Version `0.1.0-dev.2` is an unpublished preview. It includes the complete native
Knight's Eye policy-40 computation, injected analysis orchestration and a UCI
transport adapter. The approved MIT license applies; no registry publication has been performed.

## Named entry points

- `@knights-eye-chess/move-classifier/core`: `createChessAnalyzerCore`,
  `classifySuppliedEvidence`, `createAnalysisService`, search defaults and types.
- `@knights-eye-chess/move-classifier/policy/knights-eye`: typed `createKnightsEyePolicy`,
  `KNIGHTS_EYE_POLICY`, decision, material-exchange and verification types.
- `@knights-eye-chess/move-classifier/engine/stockfish`: `createStockfishAdapter`, port,
  search and result types. No engine binary or process/Worker hosting included.
- `@knights-eye-chess/move-classifier/contracts`: policy/result/evidence contracts and the
  optional immutable recorded-decision codec. No root barrel is exported.

The host supplies a structurally compatible chess implementation. There are zero
runtime npm dependencies. The KE policy optionally uses chess.js's private `_moves`
optimization when present, with a public `moves({verbose:true})` fallback. Tests
use chess.js 1.4.0 as a consumer dependency. Policies and engine ports are injected;
no UI, accounts, database, game tree, default book or LLM is imported. Packed
runtime and declarations contain no compatibility-source exports or serialization.

```ts
import { Chess } from 'chess.js';
import { createChessAnalyzerCore } from '@knights-eye-chess/move-classifier/core';
import { createKnightsEyePolicy } from '@knights-eye-chess/move-classifier/policy/knights-eye';
const analyzer = createChessAnalyzerCore(Chess, undefined, createKnightsEyePolicy(Chess));
const result = await analyzer.classifySuppliedEvidence({
  startFen: new Chess().fen(), history: ['e2e4'], depth: 18,
  evidence: [], // Supply actual position/verification search results here.
});
if (result.status === 'complete') console.log(result.decision.classification);
else console.log(result.reason, result.request); // Here: incomplete-evidence.
```

## Classification and evidence

The replay-based entry points require a starting FEN and exact nonempty UCI
history. Illegal history fails before acquisition. The core derives the selected
move's before/after/prior context and material-exchange history. A host can use its
own game model; no KE tree is required.

`analyzeAndClassify` acquires missing engine evidence and can reuse admitted private
position cache data. An undeclared evidence property cannot bypass that method.
`classifySuppliedEvidence` never calls an engine or falls back to the acquisition
cache. Supply `{kind:'live-position', fen, analysis, rootMoves?}` for every required
search scope. Missing evidence yields unavailable, with the requested scope.
Caller attribution is not cryptographic engine provenance: hosts are responsible
for supplying genuine live results. Recorded display decisions are not this type.

Admission checks exact FEN scope, finite scored legal PVs, root agreement, achieved
depth and candidate coverage. Restricted verification requires all requested roots.
Scores use the side-to-move perspective; `mate` means signed mate-in-moves, not
plies. Terminal evidence is calculated from chess rules, not trusted from a search.
Raw supplied verification objects are discarded and recomputed from admitted lines.

Results are a discriminated union: complete carries explicit policy identity,
typed decision and live evidence; unavailable carries a stable reason and optional
missing search request. Cancellation and engine failure are unavailable outcomes.
Unexpected policy exceptions propagate; they are not mislabeled as unavailable.
Complete results are transient and may be modified by the caller without mutating
the private position cache. KE policy instances fork per request, so verification
cannot leak across calls. Low-level service calls serialize use of a policy;
custom stateful policies should implement `fork` or `resetEvidence` appropriately.

`createAnalysisService` is the low-level context-based primitive. Its caller owns
exact-history/context validation and supplies the optional `legalPv` validator.
Use the replay-based core for built-in legal history and PV validation. Injected
policy terminal/legal-count callbacks are trusted chess capabilities, not checked
against another chess implementation.

## Search and opening policy

`searchPolicy: {candidateCount, verificationDepth}` is explicit; defaults preserve
KE's three-candidate cap and depth-10 acceptance verification. Ordinary searches
use caller depth. Cache reuse rechecks achieved coverage and depth. Engines may
declare lack of MultiPV or constrained-root support; unavailable reports that gap.

Opening lookup receives `{startFen, history, afterFen}` and may support custom
roots. Explicit `book` overrides bypass it. No lookup means no book assertion.
The application adapter alone retains the standard-start default book restriction.

## Recording is optional and host-owned

Package semver, policy `{id,revision}`, record schema `classifier-decision/1`,
selection policy identity and the app's dataset-v2 format are separate. The new
record codec does not migrate app storage. Schema 1 is the only readable record
schema in this preview. Foreign and other policy revisions remain attributed
historical display; even a matching restored record is never live engine evidence.
The codec detaches/freezes bounded fields and strips PV/search/job details. It
checks shape/UCI agreement, not legal occurrence replay. Three stored candidate
origins match current app presentation; review that bound before public release.

## Qualification and current integration

Inside this repository, `node scripts/build-analysis-package.mjs` refreshes the
package `src` and `test` snapshots from canonical `lib/chess-analysis` and root
tests, then runs the package build. The packed artifact includes these snapshots,
`build.mjs` and a pinned shrinkwrap. An unrelated checkout can unpack it, run
`npm ci`, delete `dist`, run `npm run build` and `npm test`, and reproduce the
packed runtime and declarations byte for byte. The original application source
is not needed for that rebuild. `node scripts/qualify-analysis-package.mjs --write`
checks this clean rebuild, package tests, unrelated install and strict NodeNext
type consumer; its current receipt is `docs/modularity/publication/ANALYSIS-QUALIFICATION.json`.
The app compatibility facade delegates to native policy. The native website imports the canonical public policy and finite runtime interfaces.
The standalone compatibility widget retains the checked generated policy plus
frozen orchestration/transport bridges.
The build-time generator checks those app compatibility files for drift.
The integrated application gate passed at Dev v487; see the dated release receipt.
This private preview has no selected public SDK support-window promise.
# Website adoption (phase 3)

The native Knight's Eye website now imports the named `core`,
`policy/knights-eye`, and `engine/stockfish` entrypoints. During private development,
explicit TypeScript/Vite aliases resolve those names to the same canonical sources
used by the package build. No root barrel or generated package output is needed
to build the website. The independent tarball qualification still tests the actual
installed public exports, with no application checkout.

`createKnightsEyePolicy(Chess, engineKind, options)` also exposes `prepared` and
`classifyPrepared(context)` for hosts that already manage incremental analysis.
These are **policy operations, not admitted complete analysis outcomes**. They may
consume provisional/derived scores and preserve historical MultiPV-first
verification precedence. The host supplies exact occurrence context, owns evidence
authority and cache invalidation, and must retain provenance when projecting the
decision into its UI. Never submit restored display records as live proof.

Optional `historyContext` callbacks resolve occurrence history without requiring
the Knight's Eye tree. Optional `preparedCaches` getters expose the host's current
transient material/verification caches; they do not load or save persistent data.
Acquisition forks retain private caches. The prepared operations include the
small set of score, legal-move, material and sacrifice helpers used by the website;
this is not a general shared-application namespace.

The replay/core APIs retain strict legal-PV, FEN, depth and coverage admission,
typed unavailable results and explicit selected-verification semantics. Streaming,
time-limited engine scheduling and dataset-v2 projection remain website-owned.
The standalone ChatGPT widget retains frozen generated compatibility code from the
same canonical policy; its complete document fingerprint is unchanged.

## Node support is independent of the application toolchain

The package retains Node >=22.13.0: its installed runtime tests use native Node
ESM and the test runner, without `tsx`, synchronous loader hooks, React or app
bundling. The application supports Node 24 because its `tsx`/synchronous-loader
composition fails on Node 22. The difference is in app test infrastructure, not
shared classifier source. Qualification records its actual runtime; the review
follow-up separately executes the installed package at the declared 22.13.0 floor.

## Standalone repository build

Use Node 24 or newer. From a clean checkout:

```sh
npm ci
npm run check
npm run pack:checked
```

The source snapshot is recorded in `SOURCE-ORIGIN.json`. This private preview
uses version `0.1.0-dev.2`; earlier `0.1.0-dev.1` artifacts remain immutable.
Internal dependencies are pinned archives in `vendor/npm`. Update an existing
dependency with `node scripts/update-dependency.mjs @knights-eye-chess/name
/absolute/path/package.tgz`, then run `npm ci` and `npm run check`. Review the
manifest, lockfile, archive hash and tests together before committing.
No registry, automatic CI or website deployment is required for these commands.

`pack:artifact` packs a temporary copy and records exact package versions for
sibling dependencies. Use it instead of bare `npm pack`; repository-local file
pins belong to the source build and are not published as consumer dependencies.
