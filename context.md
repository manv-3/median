# Project Context: Antigravity CLI + Decision Layer (Laya)

This file preserves the earlier decision-layer background for reference. The active target for the repo is now the standalone CLI described in [docs/standalone-cli-spec.md](docs/standalone-cli-spec.md).

The older brief below is kept as historical context. It was last updated after two changes: the switch from Jev (TypeSafe AI) to Laya (Convai Innovations) as the decision-layer model, and the rebalancing of the team split around Laya dependency. Still before build-order Step 1 (tool verification) has been run.

> **Naming note:** the project was originally scoped around a hosted product called **Jev**. Its role, the fast typed decision layer, is unchanged; only the underlying model swapped to **Laya**, a self-hosted open-weight alternative. Code, folders, or notes that say `jev` should be read as the decision layer generally.

Related docs: `modelcontext.md` (the Laya model), `split.md` (ownership), `details.md` (per-file reference), `README.md` (quick start), `docs/decisions.md` (decision log).

## 1. The problem

`agy` (Antigravity CLI) supports non-interactive `--print` execution, but it still behaves like a one-shot generator: it takes a prompt, generates code, and stops. If there's a bug or a missed requirement, a human has to read the logs and manually re-prompt it. We're building a wrapper that closes that loop automatically.

## 2. What we're building

A **closed-loop agentic wrapper** around `agy`, built on `agy`'s native non-interactive `--print` mode, using a second, lightweight system, the decision layer (backed by Laya), to check results and drive corrections.

1. The user gives a prompt to the wrapper.
2. The wrapper runs `agy` and captures the generated code and any stdout/stderr.
3. The wrapper builds a state payload and hands it to the decision layer.
4. The decision layer checks it (build, tests, lint, type errors, and, when needed, intent match).
5. If broken, it writes a targeted fix instruction and the wrapper sends it back to `agy` automatically. No human involved.
6. If done, the loop ends and the user gets the verified result.
7. If still unresolved after `MAX_ITERATIONS = 4`, the loop stops and outputs an escalation report (best attempt plus what's still failing) instead of guessing or silently returning unverified code.

## 3. Why it matters

- **Saves human time.** No manual re-prompting on every error.
- **Saves cost.** The checking step is meant to be cheap, not a second full LLM call just to grade output. Laya is self-hosted, so marginal cost per call is compute only.
- **Avoids self-grading bias.** A model judging its own output tends to declare victory. An independent judge doesn't have that incentive.
- **Catches the hardest failure mode.** Code that passes tests but doesn't do what was asked. A plain conditional structurally cannot catch this, and it is the real reason a separate judgment layer is worth building.

## 4. Architecture: System-2 vs System-1

- **System-2 (`agy`)**: heavy multi-file code generation, refactoring, execution.
- **System-1 (decision layer / Laya)**: fast, cheap evaluation and decision-making. Typed primitives: `choice` (generate / refine / done), `score`, `noul` (calibrated probability that requirements are satisfied).

### Why two tiers

If the decision layer only aggregates deterministic signals (tests pass? lint clean?), that is just an `if` statement and needs no model. The defensible value is a two-tier design:

- **Tier 0 (deterministic filter).** Build success, test pass rate, lint and type errors, repeated-error detection. Plain TypeScript, sub-100ms, fully deterministic. Handles the majority of iterations (clear pass, clear fail).
- **Tier 1 (semantic judge, Laya).** Fires only when Tier 0 is ambiguous: checks are green but nothing confirms the actual ask was met (for example, "add pagination" ships code that compiles and passes old tests but has no pagination). This is where real reasoning is needed and where `noul` earns its place.

Escalating to Tier 1 only on ambiguous cases keeps the system fast and cheap on average while still catching intent gaps.

### Known limitation of the current Tier 0 ambiguity rule

Tier 0's ambiguity check is a placeholder: it flags `ambiguous: true` only when the diff is empty or no tests exist at all. A run with passing tests and a non-empty diff goes straight to `done` without Tier 1, even if the goal wasn't met. Tightening this rule is what makes Tier 1 actually fire on real intent gaps, and it is a Track B task (see section 11, Step 8, and `modelcontext.md`).

## 5. Exit conditions and guardrails

- The loop ends successfully only when `phase === 'done'` AND the passing probability is **strictly greater than** 0.90. (When Tier 1 didn't run, Tier 0's score stands in for the probability.)
- Hard safety cutoff: `MAX_ITERATIONS = 4`.
- On cap hit without success: an explicit escalation report (best attempt plus diagnostics), never a silent unverified return. The report holds the best-scoring attempt, not necessarily the last one.
- Hysteresis (dead-band) around the threshold: a score in `[0.85, 0.90]` right after a `done` phase is held as `done` instead of flipping back to `refine` on noise. It can only pull a result toward `done` from just below the line; it never pushes a bad result into `done`.
- Stuck detection: the same normalized error signature repeating changes the fix instruction rather than retrying blindly. After two consecutive repeats (three identical iterations in a row), the loop stops with reason `stuck`.
- Failure classification: `environment` (missing package, command not found: stop immediately, don't retry) vs `code_bug` (retry is the point) vs `timeout` (kill and recover differently).
- State compaction: pass only the current diff, the goal, and the failure delta (not full history), but carry forward a short "requirements verified so far" list so a later fix can't silently regress something fixed earlier.
- **Specific to Laya:** the state sent to Tier 1 must fit Laya's input budget (about 512 tokens for the default checkpoint). This makes compaction a hard requirement, not just good practice.

## 6. Shared data contract

The contract is provider-agnostic. It is the only thing both tracks depend on; changes go through a pull request reviewed by both.

```ts
// /types/index.ts
export interface Checks {
  buildOk: boolean;
  tests: { passed: number; failed: number; total: number };
  lintErrors: number;
  typeErrors: number;
}

export interface StatePayload {
  goal: string;
  iterationCount: number;
  currentCodeState: string;        // diff from the last agy run
  executionErrors: string;         // captured stderr / stdout errors
  errorSignature?: string;         // normalized main error, this iteration
  previousErrorSignature?: string; // same, last iteration
  failureClass?: 'code_bug' | 'environment' | 'timeout'; // set by wrapper
  checks: Checks;
  verifiedRequirements: string[];  // carried forward each iteration
}

export type Phase = 'generate' | 'refine' | 'done';

export interface DecisionResult {
  phase: Phase;
  score: number;                   // 0 to 1, from Tier 0
  ambiguous: boolean;              // true = escalate to Tier 1
  passingProbability?: number;     // set only if Tier 1 (Laya) ran
  reasons: string[];               // why this decision (debug mode)
  fixInstruction?: string;         // sent back to agy on refine
}
```

`AgyResult` and `EscalationReport` also live in `types/index.ts`, so neither track imports from the other's files.

## 7. Tech stack

- TypeScript / Node.js for both sides (shared types). The project is ESM (`"type": "module"`).
- `execa` to run `agy` as a subprocess, capturing stdout, stderr, and exit code, with a timeout.
- **`@receptron/laya`** (npm) for the typed primitives (`choice`, `score`, `noul`), via `Laya.load()` / `systemOne()`. It runs locally on Node through ONNX Runtime: no API key, no hosted region, no waitlist. Listed as an optional dependency because its native `onnxruntime-node` binary can fail to download in restricted networks. (Replaces `@typesafe-ai/sdk` / Jev.)
- Checkpoint: `convaiinnovations/laya` (English, ModernBERT-large, 421M params, about 512-token input) as the default. `laya-multilingual` or `laya-typed-decisions` are the fallbacks if the context window is too tight for real diffs. **Verify in Step 1.** See `modelcontext.md`.
- Model weights (about 850MB to 1.7GB) download once from Hugging Face on first load, then run fully offline. Hugging Face must be reachable at least once. Cache the checkpoint directory in `.cache/`; don't commit it.
- Vitest for unit tests and the Phase 4 benchmark harness.
- Plain JSON for iteration state (SQLite later if persistent benchmark history is needed).
- `commander` for the wrapper's CLI.

## 8. Repository layout

```
antigravity-agent/
  types/        shared schema                                          (both)
  wrapper/      agy.ts, checks.ts, cli.ts, escalation.ts               (Track A)
                loop.ts, loop.test.ts                                  (Track B)
  decision/     tier0 rules, ambiguity rule, tier1 judge (Laya)        (Track B)
  fixtures/     sample-agy-outputs/ (A), labeled-examples/ (B)
  bench/        benchmark tasks and runner                             (Track A)
  docs/         decisions log, results                                 (both)
  .cache/       downloaded Laya checkpoint (git-ignored)
```

## 9. Team split

Split by dependency on the decision layer, not by phase. A file belongs to **Track B** if it needs to understand what Tier 0 or Tier 1 returns; it belongs to **Track A** if it only runs a tool or reports a result. Both people work every phase in parallel. The full breakdown, interface, and dependencies are in `split.md`.

| | **Track A: Runner and tooling** | **Track B: Decision layer and loop (Laya)** |
|---|---|---|
| Owns | Calling `agy`, running checks, CLI, escalation report, benchmark | Deciding pass/fail, scoring, judging intent, and the loop that acts on it |
| P1 | `agy` non-interactive integration, `runChecks`, real sample outputs | Tier 0 rule engine, typed interfaces, `loop.ts` skeleton, state payload builder |
| P2 | Escalation report writer, timeout, failure classification, real lint/tsc counts | Iteration cap, hysteresis, stuck detection, ambiguity rule, state compaction |
| P3 | Collect candidate intent-gap examples, CLI polish | Tier 1 judge (`noul`), verified-requirements carry-forward, final labels, calibration fit |
| P4 | Benchmark runner, cost and latency tracking, debug logging | Calibration analysis, false-"done" rate, Laya polish |

## 10. Four-phase plan

1. **Core loop and deterministic filter.** `agy` runs non-interactively, the state payload is defined, Tier 0 exists, and a basic generate, evaluate, refine/done state machine works.
2. **Guardrails and convergence.** Iteration cap and escalation report, hysteresis, error classification, state compaction with requirement carry-forward.
3. **Semantic Tier 1.** The ambiguity trigger is defined precisely, the `noul` judge is built on Laya, and 20 to 30 labeled examples are collected to justify the threshold and to fit Laya's calibration temperature (Laya ships over-confident).
4. **Evaluation and demo readiness.** Benchmark set; iterations-to-pass, false-"done" rate, and cost and latency tracking against a baseline; debug mode; docs polish.

## 11. Build order

Rule: don't start a step until the one before it works. The intent check is deliberately last.

| Step | What | Who | Done when |
|---|---|---|---|
| 1 | **Try both tools by hand.** Confirm exactly how `agy` behaves non-interactively (command, flags, output, exit codes). Confirm `@receptron/laya`'s `systemOne()` shape with a hard-coded example, and confirm the checkpoint downloads and loads. | A: `agy`. B: Laya. Parallel, days 1-2. | Each has a one-page notes file. If `agy` can't run without a human, or Laya can't do something we assumed, change the plan now. |
| 2 | **Make one tiny test project.** A small function (for example `reverseString`) plus a failing test. | Together, about 1 hour | `npm test` runs and fails, as expected, on the empty function. |
| 3 | **Agree on the data contract.** Lock `/types/index.ts` (section 6). | Together, 1-2 hours | Committed and approved by both. |
| 4 | **Build the pieces separately.** A: `runAgy()` and `runChecks()`. B: `evaluateTier0()` with hand-written payloads, plus the `loop.ts` skeleton. | Parallel | `runAgy` and `runChecks` work on the test project; `evaluateTier0` passes its hand-written cases. |
| 5 | **Connect by hand, no loop.** One script: run `agy`, run checks, build the payload, call Tier 0, print the decision. | Together | The script prints a sensible decision for the test project. |
| 6 | **Add the loop and fix instruction.** Up to 4 iterations; fix instructions name the failing test and quote the error. | A: real runners under the loop. B: loop and fix instruction. | On a task where `agy`'s first attempt is wrong, the loop corrects it itself within 4 iterations. |
| 7 | **Make it safe to leave alone.** Escalation report, error classification, timeout, stuck detection, hysteresis. | A: report, classification, timeout. B: stuck detection, hysteresis. | The 4th failure produces a report; a missing package stops the run early; a hung `agy` is killed; a repeated error changes the instruction. |
| 8 | **Add the intent check last.** Labeled examples, the `noul` judge with calibration fit, a tighter ambiguity rule, and a benchmark of `agy` alone vs `agy` plus the decision layer. | B: judge and calibration. A: benchmark and candidate examples. | At least one case is caught where tests pass but the request was missed, and a results table compares the modes. |

After Step 1, update this document with what was learned about `agy` and Laya. The remaining steps depend on it.

## 12. Open questions (unresolved)

- Does `agy` support a clean non-interactive mode with parseable stdout/stderr and reliable exit codes? **Not yet confirmed. First thing to verify.**
- Does the compacted state (diff plus goal plus failure delta) reliably fit inside Laya's input budget? **Not yet confirmed. Test with a real, non-trivial diff.**
- **Calibration:** Laya's own documentation says it ships over-confident and recommends fitting a calibration temperature per (question type, option count) on your own labeled data before trusting the probability for a threshold decision. The 0.90 threshold should not be trusted until this fit is done.
- Which checkpoint to standardize on: `convaiinnovations/laya` (English, smaller context) vs `laya-typed-decisions` (tuned for this kind of workflow, larger context)? **Decide after Step 1.**
- Is a GPU available to either of you, or is this CPU-only? This affects latency, not correctness; Laya runs on CPU via ONNX Runtime by default.
- What is the real ambiguity rule for Tier 0? The current placeholder (empty diff or zero tests) rarely fires. It needs to be agreed and tightened before Tier 1 can catch real intent gaps.

## 13. Definition of done

- The loop runs unattended on toy tasks from prompt to verified result.
- Hitting the iteration cap produces an escalation report, never a silent unverified result.
- Environment errors stop early instead of retrying blindly.
- At least one real intent gap is caught where tests alone would have said "done."
- A benchmark table compares `agy` alone, a self-judging loop (baseline), and `agy` plus the decision layer, with real numbers.
- README and a rehearsed short demo exist.

## 14. Change log

- **Initial plan:** decision layer specified as Jev (TypeSafe AI), hosted API, `@typesafe-ai/sdk`.
- **Switched to Laya** (Convai Innovations, open-weight, self-hosted via `@receptron/laya` on ONNX Runtime) after unreliable access to Jev from India. Architecture, schema, phases, and team split were unaffected; only the Tier 1 implementation and its infrastructure requirements changed.
- **Rebalanced team split** (2026-09-30): moved `loop.ts`, its tests, state payload building, compaction, and the calibration set to Track B, since they depend directly on Tier 0 and Tier 1 outputs. Track A now owns everything that only runs tools or reports results. `AgyResult` and `EscalationReport` moved into `types/index.ts`. See `split.md` and `docs/decisions.md`.
