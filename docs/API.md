# Classification and evidence contracts

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

### UCI client migration

This prerelease removes the classifier's `/engine/stockfish` runtime export.
`EngineLine`, `PositionAnalysis` and `SearchRequest` are now classifier-owned
structural types available from `/core` and `/contracts`. The classifier does
not import an engine package, including for types. Older published prereleases
retain their original adapter; their archives are unchanged.

Hosts using `createStockfishAdapter` can inject the separate UCI client's Node
host through this boundary:

```js
import { createChessAnalyzerCore } from '@knights-eye-chess/move-classifier/core';
import { createProcessEngine } from '@knights-eye-chess/uci-client/node';

const client = createProcessEngine({ command: 'stockfish' });
const engine = {
  capabilities: { multiPv: true, rootMoves: true },
  search({ depth, ...request }) {
    return client.search({ ...request, limit: { depth } });
  },
};
const analyzer = createChessAnalyzerCore(Chess, engine, policy);
// Close the client when the host's analysis job ends: await client.close().
```

`Chess` and `policy` are host-supplied in this example. The classifier still
requests depth-shaped finite evidence and checks achieved depth, legal PVs,
scores, provenance and candidate coverage. The UCI client owns protocol and
process behavior. Browser hosts supply their own transport through its root
export and use the same request translation. Expose capability flags that the
configured engine actually supports; unsupported evidence returns unavailable.

## Recording is optional and host-owned

Package semver, policy `{id,revision}`, record schema `classifier-decision/1`,
selection policy identity and the app's dataset-v2 format are separate. The new
record codec does not migrate app storage. Schema 1 is the only readable record
schema in this preview. Foreign and other policy revisions remain attributed
historical display; even a matching restored record is never live engine evidence.
The codec detaches/freezes bounded fields and strips PV/search/job details. It
checks shape/UCI agreement, not legal occurrence replay. Three stored candidate
origins match current app presentation; review that bound before public release.


The [core source](../src/chess-analysis/analyze.ts), [policy source](../src/chess-analysis/knights-eye-policy.ts) and [tests](../tests) document the executable contracts.

## Scoped classifier telemetry

The contracts entry also exports `CLASSIFIER_VERSION`, `hasCurrentClassifierVersion`,
`scopedClassifierDecision`, `ClassifierDecisionContext` and `CLASSIFIER_DECISION_SOURCE`.
The context is the structural `{ moveUci, fenBefore, fenAfter }` snapshot, so callers
may supply a richer context without depending on an AI or application package.
`scopedClassifierDecision(value, context, classification, classifierVersion)` returns
a detached telemetry record only when its exact snapshot, current policy revision,
label, signal shape and Great qualification agree; otherwise it returns `null`.
This retains the existing `version: 'classifier-decision/1'` telemetry wire shape,
which is separate from the `schema: 'classifier-decision/1'` display codec above.
Neither format grants engine evidence or chess-proof authority.

The compatibility entry exports `POSITION_RULES_SOURCE`, `CLASSIFIER_RULES_SOURCE`
and `ANALYSIS_CORE_SOURCE` extracted from the owner runtime at build time, plus
`createKnightsEyePolicyRuntime`. Applications generate historical widget strings
from these installed exports; application source is never a fallback policy owner.

## Brilliant policy 46 candidate

The unsafe-piece, trapped-piece and rescue heuristics are adapted from the
ideas in [WintrChess](https://github.com/WintrCat/wintrchess) (GPL-3.0). No
WintrChess code or dependency is included. This implementation remains MIT.
The board values are pawn 1, knight/bishop 3, rook 5 and queen 9. A non-pawn,
non-king piece is unsafe when a cheaper piece attacks it, or when direct and
compatible x-ray attackers outnumber direct and compatible x-ray defenders,
subject to pawn/cheap-defender and defended-rook-after-minor-capture exceptions.
The moving side's unsafe and trapped pieces are compared before and after the
move. A quiet move that saves its unsafe moving piece is a rescue unless it
leaves a newly unsafe, higher-value piece as the actual offer.
This board rule also decides whether an offered piece was trapped or lost
anyway. There is no separate depth-three forced-loss search or voluntary-offer
cap. The captured piece's value bounds the offered stake, and every legal
same-square recovery is considered before a static offer qualifies.

Knight's Eye's own extensions allow combinations with counter-threats, use the
best alternative move excluding the played move for the .94 already-winning
gate, and use admitted engine evaluation for soundness. The played move must be
near-best (at most .025 expected-points loss) and leave at least .40 expected
points. An admitted favorable mate for the played move can bypass the .94
alternative gate only when the covered alternative has no favorable mate
evidence; later engine searches can still change that finding. Every
enumerated legal offered-piece acceptance is searched at the verification depth, and the worst
acceptance outcome must remain at or above .40 expected points. PV material
paths, conversion gains and persistence do not enter the Brilliant proof.
The older Interesting tier still computes its tactical payoff from the PV,
only after its other gates pass; it is a separate policy under review.

A static offer of a piece already unsafe before the played move is attributed
to the mover's previous turn only if the exact two-ply history replays legally,
the same piece occupied the same square after that turn, and an opponent
capture was geometrically available then. The hypothetical capture may ignore
check or a pin on its attacker, while a king still cannot capture onto an
attacked square. Material is measured from before the mover's previous turn
through that capture and every direct recapture, so an earlier gain or an equal
trade does not create a standing offer. Moving the offered piece to a new
square creates a new offer. When the piece was newly attacked by the opponent's
last move, the policy enumerates the mover's legal immediate material captures
after every offered-piece acceptance. For each capture, it settles alternating
legal recaptures on that capture's destination square, with either side free to
stop when another legal move exists. The mover chooses the least net material
loss; the opponent chooses the greatest. The best settled reply must still
leave at least the existing 120 cp deficit. The exchange tree has a 256-node
cap per acceptance; exhaustion gives no Brilliant proof. It does not search
quiet tactical replies and requests no additional engine analysis. All legal
offered-piece acceptances remain in the verification scope, including those
that settle to an equal trade, so an unsound acceptance can still refute a
different qualifying offer. Unknown or ambiguous history cannot certify a
pre-existing static offer. Labels can still change with engine depth or budget
through the separate near-best and soundness gates.

After acceptance and any continuation proof, a move ranked below first in the
original unrestricted root search needs one exact best-versus-played root
comparison before it can receive Brilliant. `brilliantComparison(context)`
returns `null` unless all other Brilliant gates pass and that pair is not yet
admitted; otherwise it returns `{fen, depth, multiPv:2, rootMoves:[best, played]}`.
Depth is at least the achieved unrestricted root depth and never below an
already admitted ordinary comparison depth. `admitClassificationComparison`
checks the same FEN, both legal roots, complete scores/PVs, and achieved depth.
The core service searches the pair after verification, keeps a separate
occurrence/epoch attempt budget, and reuses an exact admitted pair. Prepared
hosts attach the admitted result to `context.comparisonAnalysis` before final
classification. A missing, partial, stale, or refuting pair cannot award
Brilliant; the core still returns the ordinary completed label when only this
optional pair is missing or short. Rank-1 moves add no pair search. The comparison cannot create a
board offer or sound acceptance proof. A used pair marks
`comparisonSource:'brilliant-pair'`: its `comparisonBestmove` and candidates are
pair-local, while `beforeAnalysis.bestmove` and `playedBest` retain the
unrestricted rank. If an ordinary three-root reconciliation was admitted first,
the later admitted pair replaces `context.comparisonAnalysis` for the final
decision. A move demoted from Brilliant then receives its ordinary label from
the pair's two scores, while the original unrestricted root still owns rank
and uniqueness.

The bounded forcing extension admits a temporarily uncompensated piece offer
when the static rule would otherwise call it trapped or rescued. A trapped
piece's capture can qualify if a legal checking reply remains down at least
120 cp and the acceptance search proves mate. A declined-recapture candidate
must have an equal material-restoring recapture on the board. The policy
enumerates **all** such recaptures and legal checks/captures that keep a deficit
of at least 120 cp after the second ply; when checked, all legal evasions are
considered. It searches those replies together from the exact post-acceptance
FEN at the verification depth. A declining reply must leave at least .40
expected points for the mover and score within .025 of the best equal
recapture. This comparison uses scores, not the acceptance PV's chosen second
move. Scopes above 16 roots provide no declined-recapture proof.

`continuationRequests(context, offer, primaryVerification)` returns the exact
post-acceptance `{fen, depth, rootMoves, acceptanceUci}` scopes. The scope
depth equals the admitted primary acceptance depth. The service acquires
and admits each restricted search. `verifyContinuations(context, offer,
primaryVerification, evidence)` requires the full matching root set, legal
PVs, finite scores, correct FEN provenance when supplied and achieved depth at
least the scope depth. A prepared host must search at that depth even when its
normal verification setting is lower; a shallower continuation cannot inherit
the primary proof's depth.
Prepared hosts have the same hooks but must provide genuine current live
`PositionAnalysis` objects; recorded decisions and prior PV snippets do not
count. A missing or incomplete continuation returns unavailable through the
service or no Brilliant proof through a prepared host. The 16-root bound and
real-engine corpus impact are qualification conditions for this candidate.
The opt-in component corpus uses a single thread, 16 MiB Hash, and the
browser full-game default of three seconds per position or restricted search.
It clears the engine hash and position cache between independent fixtures for
reproducibility. The browser may retain a warm engine session across jobs, so
its exact search path can still differ.
The recorded depth is the **achieved** depth when movetime stops a search
early. Its 25 fixtures include short branches and are not interchangeable
with the application's full Great-and-Brilliant acceptance inventory.

Policy revision 46 invalidates saved classifications from revision 43 and
earlier; hosts must reclassify them from current engine evidence. Its
`SacrificeVerification` record no longer exposes the old PV material-path,
material-thread, persistent-offer, conversion-gain, or voluntary-offer-cap
fields. Consumers must update generated compatibility source strings and
their hashes when adopting this runtime. The legacy Interesting payoff
calculation remains internal to that tier. This is an API/record shape change,
not an npm dependency on another chess classifier.

## Material evaluation conflicts

Policy 42 exposes `classificationComparison(context)` both on the policy and its
`prepared` operations. It returns `null` or `{fen, depth, multiPv, rootMoves}`.
For a played root line, disagreement means at least .08 expected points versus
the mover-adjusted independent child score, or opposite mate signs. A root whose
horizon covers the child (`rootDepth >= childDepth + 1`) needs no extra search.
When the played move is absent, ordinary losses do not trigger: the child must
contradict the best root by improving expected outcome by .08, have an opposing
mate sign, or create an unsupported mate-utility downgrade. Legally verified
missed mate-in-one is exempt. Same-sign mate-distance drift is not a trigger.

The comparison requests the played move and up to two leading alternatives at
`max(beforeDepth, afterDepth + 1)`. This is independent of sacrifice verification
depth. `admitClassificationComparison(context, request, result)` returns a detached
admitted position or `null`, checking exact roots, legal PVs, achieved depth,
finite scores and complete coverage. Admitted comparison lines carry
`reconciliation-root` provenance. The host places that evidence in
`context.comparisonAnalysis` for prepared classification; before/after evidence
must remain unchanged. The decision exposes `comparisonSource`,
`comparisonBestmove`, `comparisonDepth` and `comparisonCandidates` for a coherent
panel. Ordinary restricted comparisons do not establish unrestricted ranking,
uniqueness, or new Great/Brilliant credit. The selective two-root pair above
only confirms an otherwise established Brilliant offer; it never creates the
offer or replaces the original rank. A strictly deeper unrestricted root containing the
played move supersedes an older comparison.

The acquisition service's optional policy hooks preserve behavior for other
policies. Its comparison budget survives policy forks: one attempt per exact
occurrence and cache generation. Low-level hosts can supply request-level
`comparisonKey`; the replay core derives it from starting FEN plus exact history.
Successful proof is reusable across calls, failed attempts do not repeat on live
depth ticks, and `clearEvidence()` resets the replay core's epoch. Comparison
results never enter the ordinary position cache. Hosts creating short-lived
services must retain their own generation-scoped scheduling budget.

Supplied-only calls require the restricted `{kind:'live-position', fen,
rootMoves, analysis}` envelope as well as before/after inputs; they never use an
acquired comparison or silently search. Failure/incomplete/cancelled comparison
returns unavailable, never an unsupported newly computed label. Hosts retain
their last completed classification. Comparison counts and time overhead must
be measured with corpus qualification before deployment.

A low-level host may carry a previously completed live comparison in
`request.context.comparisonAnalysis`. The service re-admits its own achieved
depth and complete root set, including the played move and current root best,
and rejects conflicting known engine builds. A strictly deeper unrestricted root
supersedes it. Child depth ticks do not demand a second search after resolution.
The caller owns its engine/generation scope and must never populate this field
from recorded display data; attribution has the same trust limits as other live
supplied evidence. Supplied-only replay still requires explicit scoped envelopes.

## Adding a policy

An external policy is an `AnalysisPolicy` supplied to
`createChessAnalyzerCore(Chess, engine, policy)`. It is plain host code: import
the public `/core` types and entry point, and keep third-party classifier source
and licenses in the composition that uses them. The policy implements chess
callbacks (`terminal`, `legalCount`, `materialExchangeForMove`, `exchange`),
candidate and verification callbacks (`offer`, `verify`,
`verificationSatisfies`), and `classify` and `priorPoints`. The
`AnalysisPolicy` declaration in `/core` is the complete contract. Adapt the
third-party library's inputs and output in those callbacks; its decision only
needs a `classification` string unless the host chooses a richer decision type.

Give the policy a stable `identity: { id, revision }` that changes when the
policy implementation or its pinned upstream version changes. Record and cache
decisions under that identity. Use separate decision caches when comparing two
policies, and attribute any policy-specific extra searches to that policy.
Position evidence can be reused only when its exact FEN, search settings,
engine build and weights identity are appropriate for both calls. Stored
decisions never become live position evidence. The host may invoke the same
replay core with two separately configured policies to print side-by-side
results, while the shared UCI client provides the common searches.

For a pinned external implementation such as WintrChess, compile its original
source in the example and keep the adapter small. `move-classifier` has no
WintrChess import or GPL dependency. The composition owns its corresponding
license notice and test corpus.

## Completed UCI MultiPV searches

For unrestricted searches, MultiPV is an upper bound. On `bestmove`, the UCI client
accepts the nonempty returned candidate set even when it contains fewer lines
than requested. It retains achieved-depth, score, distinct-root and bestmove
checks. Explicit `searchmoves` requests still require every requested root.
