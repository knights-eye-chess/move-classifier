# Deterministic acquisition investigation

This is an investigation harness for application tracker #16, not an adopted
classifier policy or a new release artifact. Existing expected labels, witnesses,
continuation/comparison admission, fixture order and the default three-second
wall-clock budget are unchanged.

## Frozen experiment procedure

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
incomplete control, not a passing full oracle or a calibrated node cap.

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
