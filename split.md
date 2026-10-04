# Architectural Split & Component Ownership

This document defines the modular division of responsibilities within the **Median** Antigravity Plugin project.

---

## 1. Modular Architecture

Median is structured into two clean, decoupled tracks centered around the **Antigravity Plugin System** and the **Clef-Flash Decision Engine**:

| Component | **Track 1: Host Integration & Hook Lifecycle** | **Track 2: Decision Engine & Clef Runtime** |
| :--- | :--- | :--- |
| **Core Mandate** | Intercepts `Stop` events, resolves projects, runs workspace checks, and communicates with Antigravity | Evaluates goal fulfillment, scores intent, and manages local model inference |
| **Primary Directory** | `bin/`, `src/`, `rules/`, `skills/` | `decision/`, `scripts/`, `models/`, `types/` |
| **Needs to know model internals?** | No — consumes `tier1Judge()` as an abstraction | Yes — manages GGUF weights, `/v1/systemone` schema, and thresholds |

---

## 2. Component Inventory & Ownership

| Component | Track | Operational Role |
| :--- | :--- | :--- |
| `types/index.ts` | **Shared** | Core data types (`Checks`, `StatePayload`, `DecisionResult`). |
| `types/clef.ts` | **Track 2** | System One schema types (`SystemOneRequest`, `NoulAnswer`). |
| `plugin.json` & `hooks.json` | **Track 1** | Antigravity plugin manifest and lifecycle hook registration. |
| `bin/hook.ts` | **Track 1** | Standard I/O CLI bridge executing `handleStopHook()`. |
| `src/hook-handler.ts` | **Track 1** | Hook lifecycle orchestrator (bypasses, transcript resolution, checks). |
| `src/checks.ts` | **Track 1** | Workspace build, test (`vitest`/`jest`), and typecheck runners. |
| `src/transcript.ts` | **Track 1** | Extracts user goals and active workspace paths from `transcript.jsonl`. |
| `rules/AGENTS.md` | **Track 1** | Quality rules injected into the agent system prompt. |
| `skills/median-verify/` | **Track 1** | Interactive verification skill for autonomous agents. |
| `decision/tier0.ts` | **Track 2** | Deterministic rule engine, scoring, and ambiguity detection. |
| `decision/tier1.ts` | **Track 2** | Clef-Flash System One client, `/v1/systemone` requester, threshold gate. |
| `scripts/clef_daemon.sh` | **Track 2** | Background daemon manager for local `llama-server`. |
| `scripts/download_clef_gguf.sh`| **Track 2** | Automated download script for `Clef-Flash-Q4_K_M.gguf`. |

---

## 3. The Stable Interface

Track 1 interacts with Track 2 through clean, typed TypeScript interfaces:

```typescript
// Deterministic Tier 0 evaluation:
export function evaluateTier0(payload: StatePayload): DecisionResult;

// Semantic Tier 1 Clef evaluation:
export async function tier1Judge(
    payload: StatePayload,
    tier0Result: DecisionResult,
    config?: Partial<ClefConfig>
): Promise<DecisionResult>;
```

Neither track requires knowledge of the other's internal implementation details:
- Track 1 does not need to know how `llama-server` handles GGUF quantization.
- Track 2 does not need to know how Antigravity serializes `transcript.jsonl`.
