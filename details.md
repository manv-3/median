# File Details

A reference for every file in the repo: what it contains, what it does, who owns it, and what breaks without it.

Status legend: ✅ Real (implemented, type-checks, tested where applicable) · 🟡 Skeleton (has `TODO`s) · ⚠️ Unverified (a guess at an external API) · ⬜ Placeholder (filled in later).

Owners: **A** = Track A (runner and tooling), **B** = Track B (decision layer and loop). See `split.md`.

## Contents

1. [Root files](#1-root-files)
2. [`types/`](#2-types)
3. [`wrapper/`](#3-wrapper)
4. [`decision/`](#4-decision)
5. [`fixtures/`](#5-fixtures)
6. [`bench/`](#6-bench)
7. [`docs/`](#7-docs)
8. [Generated folders](#8-generated-folders)

---

## 1. Root files

### `README.md`
- **Contains:** quick start, status legend, repo layout, ownership summary, the call diagram, and a map to the other docs.
- **Does:** tells a newcomer what the project is and how to run it.
- **Why separate from `context.md`:** `context.md` explains why the project exists; `README.md` explains what is in the repo and how to use it. Merging them would let the pitch and the file list drift apart.
- **Breaks without it:** nothing technical; a new contributor has no entry point.

### `context.md`
- **Contains:** 14 numbered sections: problem, what we're building, why it matters, the two-tier architecture, guardrails, the shared schema, tech stack, layout, team split, phases, build order, open questions, definition of done, and a change log.
- **Does:** records the project narrative and the reasoning behind decisions. Section 4 records why the two-tier split is real and not ceremony. Section 12 marks the 0.90 threshold and Laya's context window as unresolved on purpose.
- **Breaks without it:** nothing technical (no code imports it). Institutional memory: "why 4 iterations" and "why Laya and not Jev" become questions someone has to re-ask.

### `modelcontext.md`
- **Contains:** what Laya is, its role, the three primitives, how `tier1.ts` uses it, input budget, calibration procedure, limitations, an unverified-assumptions checklist, and open decisions.
- **Does:** the single place to look up anything about the model. Owned by B.
- **Breaks without it:** nothing technical; the knowledge about Laya's limits is scattered across other files instead.

### `split.md`
- **Contains:** the split principle, file ownership, the interface between tracks, deliverables by phase, build order with owners, dependencies, working rules, and handoff checklists.
- **Does:** tells each person what they own and what they can rely on from the other.
- **Breaks without it:** nothing technical; ownership disputes come back.

### `details.md`
- **Contains:** this file.
- **Does:** per-file reference.

### `package.json`
- **Contains:**
  - `"type": "module"`. The whole project is ESM. Without it, Node treats `.js` files as CommonJS, and `execa` and `commander` (ESM-only in current versions) would throw `ERR_REQUIRE_ESM` on import. This is also why every relative import in the project ends in `.js`.
  - `optionalDependencies: { "@receptron/laya": ... }`. Deliberately not a regular dependency. Laya pulls in `onnxruntime-node`, which downloads a native binary from `nuget.org` at install time. If that is blocked, a regular dependency would fail the entire `npm install`. Optional means everything else still installs.
  - Scripts: `build` (tsc), `typecheck`, `test` and `test:watch` (vitest), `start` (runs the CLI through `tsx`), `bench`.
- **Breaks without it:** `npm install` has nothing to read; there is no project.

### `tsconfig.json`
- **Contains:**
  - `target: ES2022`.
  - `module` and `moduleResolution` both set to `NodeNext`. These must match each other (TypeScript raises `TS5110` otherwise). NodeNext is what enforces the `.js` extension on relative imports.
  - `strict: true`. Turns on all strictness flags. This is why `loop.ts` uses `trace.at(-1)?.decision.reasons`: under strict mode `at(-1)` may be `undefined`.
  - `skipLibCheck: true`. Skips type-checking inside `node_modules` declarations, so a third-party typing bug can't fail your build.
- **Breaks without it:** `tsc` and `tsx` fall back to defaults that don't match the ESM setup, producing `Cannot find module` and `Cannot find name 'process'` errors.

### `.gitignore`
- **Contains:** `node_modules/`, `dist/`, `.cache/`, `escalation/`, `coverage/`, `*.log`, `.env`.
- **Does:** keeps generated and sensitive files out of git. `.cache/` matters most: it holds the Laya checkpoint (roughly 800MB to 1.7GB). `escalation/` holds regenerated failure reports.
- **Breaks without it:** the first `git add .` after `npm install` could stage `node_modules` and a multi-gigabyte model into history, which is painful to undo.

---

## 2. `types/`

### `types/index.ts` (✅, owned by both)
The shared contract. Nothing here calls `agy` or a model.

| Export | Fields and why they exist |
|---|---|
| `Checks` | `buildOk`: a single gate; a broken build makes every other signal meaningless. `tests: { passed, failed, total }`: three numbers because a ratio alone can't tell 3 of 3 from 3 of 300. `lintErrors` and `typeErrors`: separate because Tier 0 weights them differently (0.02 vs 0.05). |
| `StatePayload` | `goal`, `iterationCount`, `currentCodeState` (the diff), `executionErrors`. `errorSignature` and `previousErrorSignature`: two separate fields so the payload carries its own one-step history and stuck detection needs no external state. `failureClass`: lets the loop special-case environment failures before building a full payload. `checks`. `verifiedRequirements: string[]`: a list of strings, not a count, so requirements can be named and checked individually (currently simplified). |
| `Phase` | `'generate' \| 'refine' \| 'done'` |
| `DecisionResult` | `phase`, `score` (Tier 0's number), `ambiguous` (the single field that decides whether Tier 1 runs), `passingProbability?` (optional because only Tier 1 sets it; the loop falls back to `score` when absent), `reasons` (for `--verbose` and reports), `fixInstruction?` (sent to `agy` on refine). |
| `AgyResult`, `EscalationReport` | Moved here from `loop.ts` so neither track imports the other's code. |

- **Breaks without it:** `loop.ts`, `tier0.ts`, `tier1.ts`, `agy.ts`, and `checks.ts` all import from here and stop compiling.

### `types/laya.d.ts` (⚠️, owner B)
- **Contains:** an ambient declaration for `@receptron/laya`, including `LayaAnswer.noul?: number`.
- **Does:** lets `tier1.ts` compile. Written from documentation, not the package's real `.d.ts`.
- **Risk:** `tier1.ts` reads `result.answers.satisfied?.noul`. If the real field is named differently, this breaks silently at runtime while TypeScript still compiles against the assumed shape. Confirm in Step 1, then delete this file in favor of the real types.
- **Why a standalone file:** an inline `declare module` inside a file with top-level imports is treated as an augmentation and fails with `TS2664`.
- **Breaks without it:** `tier1.ts` fails with `Cannot find module '@receptron/laya'`.

---

## 3. `wrapper/`

### `wrapper/loop.ts` (✅, owner B)
The standalone retry loop. **Exports:** `runClosedLoop(goal, deps)` and the types `LoopDeps`, `LoopResult`, `IterationLog`.

**Constants:**

| Constant | Value | Meaning |
|---|---|---|
| `MAX_ITERATIONS` | 4 | Hard retry limit |

**`LoopDeps`:** the single function the loop needs, `runAgy(prompt)`. Tests inject a fake `runAgy` so the loop can be verified without calling the real CLI.

**Order of operations, every iteration:**
1. Run `agy` with the current prompt.
2. If `failureClass === 'environment'`, stop immediately and return an escalation report.
3. Treat a non-empty stdout string with exit code `0` as success.
4. If the output is empty or the exit code is non-zero, build a focused retry prompt that includes the prior stderr/stdout.
5. Retry up to four times.
6. If the loop never gets a non-empty successful result, escalate with the best output it saw.

**Breaks without it:** there is no retry policy; `cli.ts` has nothing to run.

### `wrapper/loop.test.ts` (✅, owner B)
Three vitest cases, each exercising one exit path with mocked `runAgy`:

| # | Proves |
|---|---|
| 1 | A non-empty stdout result with exit code 0 returns success on the first iteration. |
| 2 | An empty result retries until the four-attempt limit and escalates. |
| 3 | An environment failure stops immediately and writes an escalation report. |

### `wrapper/agy.ts` (🟡, owner A)
- **Contains:** `runAgy(prompt)` and `classifyFailure(err)`.
- **Does:** runs `execa('agy', ['--print', prompt, '--output-format', 'text'])`. `execa`'s timeout is its own kill switch: on a hang it throws with `.timedOut === true`.
- **`classifyFailure`:** checks `timedOut` first (most specific), then `err.code === 'ENOENT'` or a "command not found" match for `environment`, and defaults everything else to `code_bug` (if `agy` ran and still failed, treat it as a code problem).
- **TODOs:** output parsing is still intentionally simple, but the command and flags are now verified against the native `agy` CLI.
- **Breaks without it:** the loop has no way to call `agy`.

### `wrapper/checks.ts` (🟡, owner A)
- **Contains:** `ranCleanly()`, `runTests()`, `countIssues()`, and `runChecks()`, which folds them into a `Checks` object.
- **`ranCleanly()`:** runs any command and returns whether it exited 0. Correct as written; used for the build check.
- **`runTests()`:** assumes `vitest run --reporter=json` and reads `numPassedTests`, `numFailedTests`, `numTotalTests`. That is Vitest's real output shape, so it works as-is if generated projects also use Vitest.
- **`countIssues()`:** the weakest part. It counts occurrences of the word "error" in linter and `tsc` text output as a stand-in for real counts. It will over- or undercount depending on the tool. Replace with `eslint --format json` and a proper `tsc` parse.
- **Breaks without it:** the loop cannot produce a `Checks` object, so Tier 0 has nothing to read.

### `wrapper/cli.ts` (✅, owner A)
- **Contains:** the entry point. Takes a goal string and `-v, --verbose`.
- **Does:** wires `runAgy` into `runClosedLoop` and writes the escalation report if the loop fails.
- **With `--verbose`:** prints the goal, the final reason, and the retry count.
- **On success:** prints the final agy output to stdout and exits 0.
- **On escalation:** awaits `writeEscalationReport(...)` before `process.exit(1)`. The `await` matters: without it the process can exit before the file write resolves and drop the report.
- **Ownership note:** this file owns the top-level CLI behavior, so changes to prompt handling or exit codes belong here.

### `wrapper/escalation.ts` (✅, owner A)
- **Contains:** `writeEscalationReport(report)` and `toMarkdown()`.
- **Does:** turns an `EscalationReport` into three files in `escalation/`:

| File | Purpose |
|---|---|
| `report.json` | Full report object, machine-readable, for `bench/run-bench.ts` to parse later |
| `report.md` | Trace as a bullet list (`- Iteration 2: phase=refine, score=0.45, error="..."`), readable in under a minute |
| `best-attempt.txt` | Just the code, so it can be copied straight into an editor or diff tool |

- `mkdir(outDir, { recursive: true })` matters because `escalation/` doesn't exist until the first failure; without `recursive`, the first write would throw `ENOENT`.
- **Breaks without it:** hitting the iteration cap would end the process with no output, which the definition of done forbids.

---

## 4. `decision/`

### `decision/tier0.ts` (✅, owner B)
Deterministic rules. No model, no network, no async. **Exports:** `evaluateTier0(payload)`.

**Constants:** `LINT_PENALTY = 0.02` per lint error, `TYPE_PENALTY = 0.05` per type error. Type errors weigh more because they are more likely to be real bugs than style issues.

**Logic:**
1. `!checks.buildOk` → `refine`, score 0.
2. Otherwise score starts at the test pass rate (`passed / total`), minus the penalties, clamped to `[0, 1]`.
3. Failing tests, lint errors, or type errors → `refine`, `ambiguous: false`. A concrete mechanical failure needs no judgment call.
4. All green → the case Tier 0 cannot safely resolve alone. The placeholder rule flags `ambiguous: true` if `nothingChanged` (empty diff) or `noTestsWereAdded` (no verified requirements and zero tests).
5. Otherwise → `done`.

**Worked example:** `tests 3/3, lintErrors 1, typeErrors 0` gives `passRate = 1`, score `1 - 0.02 = 0.98`, `allChecksClean = false` → `refine`, `ambiguous: false`. The score is high but the phase is still `refine`, because phase and score are independent outputs. With `lintErrors: 0` and a non-empty diff, it falls through to `done`.

**Known limitation:** the ambiguity rule is deliberately narrow and rarely fires. Green tests with a non-empty diff go straight to `done` without Tier 1. Tightening this is a Step 2 / Step 8 task to agree together.

**Helper:** `buildFixInstruction` turns a failure into a specific instruction that names the failing test or quotes the type error, instead of a generic "try again."

### `decision/tier1.ts` (✅, owner B)
The Clef-flash semantic judge. **Exports:** `tier1Judge(payload, tier0, config?)`, `queryClef`. Only reached when Tier 0 sets `ambiguous: true`.

- **Clef-flash decision model:** Uses Cloudflare's `clef-flash` (9B parameters, 65,536 token context, ~38ms latency).
- **Execution flexibility:** Supports local Hugging Face execution (`Cloudflare/clef-flash` via `CLEF_ENDPOINT`) or hosted Cloudflare Workers AI (`@cf/cloudflare/clef-flash` via API keys).
- **State sent:** `goal`, `diff`, and `verifiedRequirements`.
- **One `noul` question,** instructed to answer false if the goal describes behavior the diff does not implement.
- **Result:** probability above `RAW_DONE_THRESHOLD` (0.90) → `done`; otherwise `refine` with a generated fix instruction.
- **Fail-safe:** If neither local endpoint nor cloud credentials are set, it records the notice and safely allows Tier 0's clean result rather than crashing or locking the workflow.

---

## 5. `fixtures/`

### `fixtures/sample-agy-outputs/` (⬜, owner A)
- **Will contain:** real `agy` outputs: a good run, a broken run, and a run with a raw error.
- **Does:** lets both tracks write tests against real output instead of calling `agy` every time. Raw process output, used to test `agy.ts` and `checks.ts` (Phase 1).

### `fixtures/labeled-examples/` (⬜, owner B)
- **Will contain:** 20 to 30 `(prompt, code, human verdict)` triples, including code that passes tests but misses the ask.
- **Does:** justifies or corrects the 0.90 threshold and fits Laya's calibration temperature (Phase 3, Step 8).
- **Why separate from the folder above:** different phase, different consumer, different shape of data. One tests a parser; the other tunes a threshold.

---

## 6. `bench/`

### `bench/run-bench.ts` (🟡, owner A)
- **Contains:** the types `BenchTask` and `BenchResult`, and a `main()` skeleton. Everything inside is `TODO` until Phases 1 to 3 work end to end.
- **Does:** will run each task under three modes:

| Mode | Purpose |
|---|---|
| `agy_alone` | The floor: no loop |
| `self_judging_baseline` | `agy` grading its own output. The comparison this project exists to beat. |
| `agy_plus_decision_layer` | This project |

`self_judging_baseline` is a named mode on purpose: the justification for building this rests on beating that baseline, so the benchmark measures it explicitly. It tracks iterations-to-pass, false-"done" rate, and cost and latency.

### `bench/tasks/` (⬜, owner A)
- **Will contain:** one folder per benchmark task, each with a starting project and a goal.

---

## 7. `docs/`

### `docs/decisions.md` (✅, owner both)
- **Contains:** a template plus entries for the Jev-to-Laya switch and the team-split rebalance.
- **Entry format:** date, **Changed**, **Why**, **Affects**. Free-text logs tend to skip the reasoning or skip what a change touches. Fixed fields mean "why Laya" doesn't require reconstructing the reasoning, and "Affects" tells you which other documents to re-check for staleness.
- **Relationship to `context.md`:** `context.md` is the current state; `decisions.md` is why it is in that state.

---

## 8. Generated folders

| Folder | Created by | Contents | In git? |
|---|---|---|---|
| `.cache/` | First Laya load | Downloaded model checkpoint (about 850MB to 1.7GB) | No |
| `escalation/` | `writeEscalationReport` | `report.json`, `report.md`, `best-attempt.txt` from the latest failure | No |
| `node_modules/`, `dist/`, `coverage/` | npm, tsc, vitest | Dependencies, build output, coverage reports | No |
