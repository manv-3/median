# Team Split

Two people, two tracks. The split is by **dependency on the decision layer**, not by phase:

- A file belongs to **Track B** if it needs to understand what Tier 0 or Tier 1 returns.
- A file belongs to **Track A** if it only runs a tool or reports a result.

Both tracks work in every phase, in parallel.

| | **Track A: Runner and tooling** | **Track B: Decision layer and loop (Laya)** |
|---|---|---|
| One line | Runs `agy` and the checks, reports results | Decides what the results mean and drives the loop |
| Needs to know about Laya? | No | Yes |

## 1. Why this split

The earlier split put `loop.ts` on Track A while Tier 0 and Tier 1 sat on Track B. But the loop is where Tier 0 and Tier 1 outputs are acted on: the 0.90 gate, hysteresis, stuck detection, and the fix-instruction rewrite all live there. Every change to a decision-layer output forced a change in `loop.ts`, so the two people were constantly editing each other's code.

Grouping by dependency removes that. Track A's surface shrinks to three functions with stable signatures, and Track B owns everything that reacts to a decision. It also lightens Track A, whose Step 1 work (verifying that `agy` runs non-interactively) is already the riskiest task in the project.

## 2. File ownership

| File or folder | Owner | Notes |
|---|---|---|
| `types/index.ts` | Both | The only shared file. Changes go through a PR reviewed by both. |
| `types/laya.d.ts` | B | Unverified. Replace or delete after Step 1. |
| `wrapper/agy.ts` | A | Real command and flags, agy's native non-interactive mode, output parsing, timeout, failure classification. |
| `wrapper/checks.ts` | A | Build, test, lint, and tsc runners producing a `Checks` object. |
| `wrapper/cli.ts` | A | Entry point. Wires all pieces together; imports B's `tier0`, `tier1`, and `loop`. |
| `wrapper/escalation.ts` | A | Writes the escalation report files. |
| `wrapper/loop.ts` | B | The state machine, plus payload building, compaction, and requirement carry-forward. |
| `wrapper/loop.test.ts` | B | Mock-based tests for every exit path. |
| `decision/tier0.ts` | B | Deterministic rules and the ambiguity rule. |
| `decision/tier1.ts` | B | The Laya semantic judge. |
| `fixtures/sample-agy-outputs/` | A | Real `agy` outputs (good run, broken run, raw error). |
| `fixtures/labeled-examples/` | B | Final verdict labels. A collects candidate examples in P3. |
| `bench/` | A | Benchmark runner and tasks. B supplies calibration analysis. |
| `docs/decisions.md` | Both | Log every change to the plan. |

## 3. The interface between the tracks

Track A delivers three functions. Everything behind them is internal to Track A:

```ts
runAgy(prompt: string): Promise<AgyResult>
runChecks(code: string): Promise<Checks>
writeEscalationReport(report: EscalationReport): Promise<void>
```

Track B delivers the loop and what feeds it:

```ts
runClosedLoop(goal: string, deps: LoopDeps): Promise<LoopResult>

interface LoopDeps {
  runAgy: (prompt: string) => Promise<AgyResult>;
  runChecks: (code: string) => Promise<Checks>;
  evaluateTier0: (payload: StatePayload) => DecisionResult;
  tier1Judge: (payload: StatePayload, tier0: DecisionResult) => Promise<DecisionResult>;
}
```

`AgyResult` and `EscalationReport` live in `types/index.ts`, so neither track imports from the other's files. `cli.ts` is the one file that connects everything, which is why it is a natural joint review point.

### What each side promises

**Track A promises:**
- `runAgy` never throws; failures come back inside `AgyResult` with a `failureClass` (`environment`, `timeout`, or `code_bug`).
- `runAgy` enforces its own timeout (120 seconds currently) and reports it as `timeout`.
- `runChecks` always returns a complete `Checks` object, with `buildOk: false` if the build fails.
- `writeEscalationReport` completes its file writes before the process exits.

**Track B promises:**
- The loop never calls `runChecks` after an `environment` failure.
- The loop never returns `done` without `phase === 'done'` and a probability strictly above 0.90.
- Hitting the iteration cap always produces an escalation report, never a silent return.
- Tier 1 only runs when Tier 0 sets `ambiguous: true`.

## 4. Deliverables by phase

| Phase | Track A | Track B |
|---|---|---|
| **P1: core loop and filter** | `agy` non-interactive integration (command, flags, output format, exit codes); `runChecks`; real sample outputs saved to fixtures | Tier 0 rule engine; typed interfaces; `loop.ts` skeleton; state payload builder |
| **P2: guardrails** | Escalation report writer; timeout handling; failure classification; real lint and tsc counts replacing the word-count placeholder | `MAX_ITERATIONS` enforcement; hysteresis; stuck detection and fix-instruction rewrite; ambiguity rule; state compaction |
| **P3: semantic Tier 1** | Collect candidate intent-gap examples (code that passes tests but misses the ask); CLI `--verbose` polish | Tier 1 judge via `noul`; verified-requirements carry-forward; final verdict labels; calibration fit |
| **P4: evaluation** | Benchmark runner (three modes); cost and latency tracking; debug logging | Calibration analysis; false-"done" rate; Laya integration polish |

## 5. Build order with owners

| Step | Track A | Track B | Together |
|---|---|---|---|
| 1. Try both tools by hand | Run `agy` non-interactively; write down the command, flags, output, and exit codes on success and failure | Install `@receptron/laya`; run `systemOne()` with a hard-coded input; confirm the checkpoint loads and how many tokens a real state uses | Each writes a one-page notes file |
| 2. Tiny test project | | | Small function plus a failing test; `npm test` fails as expected |
| 3. Data contract | | | Lock `types/index.ts` |
| 4. Build separately | `runAgy()`, `runChecks()` | `evaluateTier0()` with hand-written payloads; `loop.ts` skeleton | |
| 5. Connect by hand | | | One script, run once, check the decision is sensible |
| 6. Loop and fix instruction | Real runners under the loop | The loop; fix instructions that name the failing test and quote the error | Test on a task where `agy`'s first attempt is wrong |
| 7. Safe to leave alone | Report on the 4th failure; failure classification; timeout | Stuck detection; hysteresis | |
| 8. Intent check | Benchmark; candidate examples | Judge, calibration, tighter ambiguity rule | Results table |

## 6. Dependencies to manage

- **Real `agy` outputs are the critical path.** Track B's loop tests are mock-only until Track A saves real outputs to `fixtures/sample-agy-outputs/`. Track A's Step 1 notes unblock both tracks.
- **Labeling.** Track A collects candidate examples in P3, but Track B assigns the final verdicts, since those labels feed calibration.
- **`cli.ts` wiring.** Track A owns it but it imports Track B's `tier0`, `tier1`, and `loop`. Agree on the exports early, and review changes to `cli.ts` together.
- **Shared types.** Any change to `types/index.ts` is a PR both approve. Add optional fields where possible so the other track's code doesn't break.
- **Track B's workload peaks in P3** (Tier 1, carry-forward, calibration together). Track A's candidate-example collection is the main mitigation. If Track B is still overloaded, hand the carry-forward bookkeeping to Track A once the format is agreed.

## 7. Working rules

1. Don't start a step until the one before it works.
2. `types/index.ts` changes go through a PR reviewed by both.
3. Any change that alters the plan gets an entry in `docs/decisions.md` (Changed / Why / Affects).
4. Build against mocks and fixtures, not against the other person's unfinished code.
5. After Step 1, update `context.md` and this file with what was learned about `agy` and Laya.

## 8. Handoff checklist

Before P1 starts:
- [ ] `AgyResult` and `EscalationReport` moved into `types/index.ts`; `loop.ts`, `agy.ts`, and `escalation.ts` import them from there.
- [ ] Both people have read `context.md`, `modelcontext.md`, and this file.
- [ ] Step 1 notes files written and shared.

Before P3 starts:
- [ ] Real `agy` outputs are in `fixtures/sample-agy-outputs/`.
- [ ] The Tier 0 ambiguity rule is agreed and implemented.
- [ ] The checkpoint choice is settled and the token budget is measured against a real diff.
