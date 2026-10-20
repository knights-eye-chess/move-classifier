# Legacy corpus acquisition qualification

The opt-in legacy corpus test defaults to `nodes-admit` with a 2,000,000-node
cap after the bounded qualification below. This changes test acquisition only:
expected labels, witnesses, continuation/comparison admission, fixture order
and application classifier behavior are unchanged. No new release artifact is
created. The three-second wall-time mode remains an explicit negative control.
Earlier procedure and intermediate findings below are retained as history;
the final selection and its limits are recorded after the complete study table.

## Initial experiment procedure (superseded after censored control)

1. Pin the JS and WASM engine artifacts by SHA-256. Use Full Stockfish 19,
   one thread, 16 MiB hash and depth 15. Clear hash for each fixture and keep the
   existing per-fixture FEN cache and search order. Record the machine/CPU
   affinity and engine identity separately from algorithm settings.
2. Run the complete fixture set with `KE_CORPUS_BUDGET_MODE=depth`. The command
   is `go depth N`, without a movetime or node cap. A 30-second independent
   watchdog still fails the search and discards the engine. Record cumulative
   nodes for every ordinary and restricted search before selecting a node cap.
3. If the control completes, choose the smallest power of two at least as large
   as its maximum observed search node count. Freeze that value before comparing
   classification outcomes. It is a measured compute envelope, not a parameter
   to tune until labels match. If the control times out, stop and investigate;
   do not silently increase its deadline or admit partial evidence.
   This superseded rule was not used for adoption; see [Selection and scope](#selection-and-scope).
4. Run `KE_CORPUS_BUDGET_MODE=nodes` with that fixed `KE_CORPUS_NODE_LIMIT` in
   an otherwise quiet execution and under declared CPU contention. Keep the
   independent watchdog unchanged. Record under-depth node-limited searches;
   continuation and comparison evidence must still satisfy existing depth gates.
5. Retain the original wall-time arm as a negative control under the same load.
   Compare normalized transcripts, achieved depths, nodes, scores, PVs, selected
   labels and the entire unchanged expected oracle. A result that disagrees with
   the oracle is a failed qualification, not permission to change the oracle.

Set `KE_CORPUS_SEARCH_RECORD` to a local JSON output file to retain the budget,
engine name and all per-search receipts. `nodes` is the maximum cumulative UCI
node counter in that search, not a sum across MultiPV lines. Node caps can be
slightly exceeded by engine polling granularity. Transcript normalization removes
only time, NPS and hash occupancy; semantic differences remain visible.

No application runtime, package version or published archive changes as part of
this investigation. Adoption requires complete oracle requalification and the
existing release review. Provider/model calls are unnecessary.

## Watchdog behavior

On timeout the runner sends `stop`, rejects the search and marks the session
failed. A bestmove arriving in the grace period is not admitted; the process is
asked to quit. If it remains alive after one second it is killed. A failed
session cannot start another analysis or carry hash state into another fixture.
Tests cover both a responsive engine returning late evidence and an engine that
ignores stop/quit, plus the search-command and node-receipt semantics.

## First control result (20 October 2026)

Full Stockfish 19 WASM artifacts:

- JS SHA-256: `8071dee87312f74805a859de933e1a1ef465579ab1a51fbd597388cdce9d444d`
- WASM SHA-256: `991bede2f253ebb08ff01fcc48270f4b9c8e66b12d5bd5f8d6f52eb3e3b3a740`

The complete depth-15 control was attempted serially on the cloud executor
(cgroup quota four CPUs; no deliberate contention or CPU pinning). It stopped
in fixture 14 at its 30-second watchdog after 630 completed searches. All
completed searches reached requested depth; the largest completed search used
4,515,685 nodes and the slowest completed search took 13,455 ms. This is an
incomplete, censored control, not a passing full oracle or a calibrated node cap.
The largest completed node count is only a lower bound on required work.

A targeted fresh-process replay of fixture 14, preserving its order and hash
clearing, completed all 30 searches and passed its unchanged expected labels.
The problematic position required 9,945,703 nodes and 29,664 ms to reach depth
15. Only 336 ms remained before the watchdog. That single rerun does not prove
reproducibility or provide a safe contention margin. The original failure remains
part of the evidence; it is not replaced by the passing rerun.

No node envelope has been selected or adopted. The prescribed next step is to
review the failed control and required compute envelope before any quiet/load
comparison. Increasing the watchdog or changing expectations is not an automatic
response to this result. The opt-in node profile rejects under-depth evidence
as a failed search, retaining diagnostic scores/PVs but never passing them to
the classifier. The default wall-time profile retains existing admission behavior.

## Revised bounded study after review

The depth-only result does not justify adoption. Requiring all main searches to
reach depth 15 is stricter than the shipped admission rules. The original strict
`nodes` arm remains available as a diagnostic; the new `nodes-admit` arm passes
reached-depth evidence through the unchanged policy, including its existing
verification, continuation and comparison depth gates.

Freeze three experimental caps **1,000,000, 2,000,000 and 4,000,000 nodes** before
running or inspecting their labels. Each fixture gets a new engine process,
with the same settings, hash clear, FEN cache and search order. A failed fixture
is recorded and the next fixture uses a fresh engine. No failed search evidence
is admitted. Keep the 30-second watchdog and one-second stop grace unchanged.

For each cap compare quiet versus declared CPU contention, normalized search
transcripts and the complete unchanged oracle. Also run the wall-time profile
under both conditions as a negative control. Record CPU affinity and contention
process count/load with the receipts; a control with no effective contention
cannot establish load independence. Report all under-depth searches, restricted
gate usage and main-position consumption by actual or expected special decisions.
Consumption marks are conservative dependencies, not proof that an under-depth
search caused a label change. Diverging decisions can also change subsequent
search requests; compare the ordered search identities as well as transcripts.

Raw receipts contain owner-game names, FENs and PVs: **keep them local; do not
commit them or paste them into issues**. Only sanitized aggregate findings and
artifact hashes belong in review documents. No cap is an adopted product budget.

## Frozen quiet/contention study results

Settings: pinned Full Stockfish 19 WASM hashes above; one thread; 16 MiB hash; requested main depth 15; fresh engine/hash per fixture, retained within-fixture hash and FEN cache. Runner/engine pinned to CPU 4 on a four-CPU-quota executor. Contended arms add one busy loop on CPU 4; its CPU accounting is retained locally. 30-second independent watchdog and one-second stop grace are unchanged.

| Arm | Seconds | Fixtures | Acquisition failures | Oracle differences | Searches | Under depth | Under depth with special/gate dependency | Under-depth restricted | Max nodes | Max search ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| wall-0-quiet | 1112 | 25 | 0 | 0 | 976 | 36 | 4 | 0 | 1431729 | 3008 |
| wall-0-contended | 1932 | 25 | 0 | 1 | 977 | 155 | 30 | 0 | 950843 | 3017 |
| nodes-admit-1000000-quiet | 1079 | 25 | 0 | 1 | 976 | 36 | 5 | 0 | 1000719 | 3527 |
| nodes-admit-1000000-contended | 2261 | 25 | 0 | 1 | 976 | 36 | 5 | 0 | 1000719 | 6894 |
| nodes-admit-2000000-quiet | 1202 | 25 | 0 | 0 | 976 | 16 | 4 | 0 | 2000805 | 6430 |
| nodes-admit-2000000-contended | 2556 | 25 | 0 | 0 | 976 | 16 | 4 | 0 | 2000805 | 13763 |
| nodes-admit-4000000-quiet | 1318 | 25 | 0 | 0 | 976 | 5 | 2 | 0 | 4000680 | 13253 |
| nodes-admit-4000000-contended | 2755 | 25 | 0 | 0 | 976 | 5 | 2 | 0 | 4000680 | 27024 |

Under-depth consumption counts are conservative dependencies, not causal proof. Engine node polling can overshoot the requested cap slightly. Acquisition failures and oracle differences are distinct outcomes.

### Completed paired comparisons

- nodes-admit-1000000: ordered search identities match; 976 normalized transcripts match, 0 differ. Fixture result sets match.
  Normalized transcript SHA-256 (quiet / contended): `7a4a4f143171968cb16ef93be91e8ab02531be0002c025bbf6ff67d2444d42b8` / `7a4a4f143171968cb16ef93be91e8ab02531be0002c025bbf6ff67d2444d42b8`.
- nodes-admit-2000000: ordered search identities match; 976 normalized transcripts match, 0 differ. Fixture result sets match.
  Normalized transcript SHA-256 (quiet / contended): `d874396aa9ca9ae1092377053c4a366f255703d84ee930a58120f91238923fda` / `d874396aa9ca9ae1092377053c4a366f255703d84ee930a58120f91238923fda`.
- nodes-admit-4000000: ordered search identities match; 976 normalized transcripts match, 0 differ. Fixture result sets match.
  Normalized transcript SHA-256 (quiet / contended): `59f87ccffb2a590577b4e7adeab6ab7d40df25d517f2a12c95f1bd2ee73c0aec` / `59f87ccffb2a590577b4e7adeab6ab7d40df25d517f2a12c95f1bd2ee73c0aec`.
- wall-0: ordered search sequences differ; no whole-corpus equality percentage is meaningful. Fixture result sets differ.
  Normalized transcript SHA-256 (quiet / contended): `c2ea3449a2be411a608f1dfb8b7a71f523a9d9ae2a28b7b83ed2ac6949ef6ba9` / `c155d057f4d7d800afae7a8742496f734c4ca1c1ebf2c5fbb902871edcf5c7cb`.

## Selection and scope

All three caps and both wall controls were declared before their outcomes were
inspected. The selection rule, recorded after the 2M pair but before the 4M result,
is the smallest declared cap passing the unchanged oracle and quiet/contended
transcript equality, subject to review of contradictory 4M findings. It was not
written down before all outcomes, and must not be described that way.

The 1M pair is repeatable but fails one fixture oracle. The 2M and 4M pairs both
pass all 25 fixtures and match all 976 normalized transcripts within each pair.
Their complete classification sets are also equal across caps. Select **2M** for
the gated test. Its measured quiet duration is 1,202 seconds versus 1,318 seconds
at 4M; halving the node cap does not halve total corpus time. The contended times
are 2,556 and 2,755 seconds. The 4M longest search takes 27,024 ms, leaving less
margin against the unchanged 30-second watchdog than 2M's 13,763 ms.

This establishes repeatability under the declared contention for this corpus,
pinned engine, one thread, 16 MiB hash and executor. It is not a claim of product,
cross-platform, multi-thread or different-engine determinism. Engine artifacts,
cap, requested depth, thread count and hash size are qualification inputs;
changes require requalification. The browser's device-dependent wall-time search
is outside this test-only change. Keep the gate opt-in/manual, not on every PR.

### Receipt-only score/PV comparison

The 1M mismatch becomes Brilliant at 2M, which is permitted by the fixture's
existing alternative oracle; it is not a restored mandatory Interesting label.
All five search dependencies for that move reach requested depth at 2M. Its
previously depth-14 main search reaches depth 15 after 1,374,312 nodes.

The four dependency-marked under-depth searches at 2M all retain their best move
at 4M, but **three change candidate scores or PVs**. Two change the candidate
root set; among common roots the maximum absolute score difference is 24 cp.
Achieved depths change 13 to 14, 14 to 15, 13 to 13, and 14 to 15. Only one has
identical candidate scores and PVs. Classification sets are stable here, but
underlying search evidence has not converged. No additional engine runs were
performed for this receipt comparison.

Raw receipts remain private because they contain owner-game positions and PVs.
The hashes and aggregate results above are the reviewable record. The unchanged
oracle, strict diagnostic mode, independent watchdog and rejection of failed
search evidence remain in place. No thresholds, witnesses or expected labels
were adjusted to obtain a pass.
