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
