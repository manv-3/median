# Project Context: Median Antigravity Plugin & Clef-Flash Quality Gate

This document serves as the comprehensive architectural context and design record for **Median**.

---

## 1. The Problem

Modern AI coding agents (such as Google Antigravity / `agy`) are capable of impressive multi-file code generation and refactoring. However, they frequently suffer from **premature completion bias**:
- Declaring a task complete while unit tests are failing or compilation errors remain.
- Creating mock stubs, empty function signatures, or partial implementations that technically compile but do not fulfill the requested prompt.
- Relying on human developers to manually review output logs, spot failures, and manually re-prompt the agent to fix errors.

---

## 2. What Median Is

**Median** is an autonomous, two-tier quality gate and verification **plugin** for **Google Antigravity (`agy`)**.

Rather than wrapping `agy` externally, Median operates *inside* Antigravity using native extension points:
1. **`Stop` Lifecycle Hook (`hooks.json`)**: Intercepts the agent whenever it attempts to conclude a task (`model_stop`).
2. **Deterministic Quality Gate (Tier 0)**: Evaluates workspace build scripts, unit tests, and type checking in < 1ms.
3. **Semantic Intent Gate (Tier 1)**: Evaluates code diffs against task goals using Cloudflare's **Clef-Flash** (9B multimodal decision model running locally via `llama-server` in GGUF format).
4. **Autonomous Self-Correction**: When quality checks fail, Median returns `{ "decision": "continue", "reason": "<instructions>" }`. Antigravity's internal planner receives this rejection and commands the agent to self-correct within the active session.
5. **Agent Rules & Skills**: Injects quality guidelines directly into the agent's system prompt ([`rules/AGENTS.md`](rules/AGENTS.md)) and provides an on-demand verification skill ([`skills/median-verify/`](skills/median-verify/SKILL.md)).

---

## 3. Two-Tier Verification Architecture

```
Agent Attempts Stop (model_stop)
             │
             ▼
   [Stop Lifecycle Hook] ──▶ Informational query? ──▶ YES ──▶ Return { decision: "allow" }
             │ (NO)
             ▼
┌───────────────────────────────┐
│     Tier 0 Quality Gate       │
│  - npm run build              │
│  - npm test / vitest          │
│  - npx tsc --noEmit           │
└──────────────┬────────────────┘
               │
      All checks passed?
      ├── NO  ──▶ Return { decision: "continue", reason: "Fix tests..." } ──▶ Agent Self-Corrects
      └── YES ──▶ Ambiguous goal fulfillment?
                    ├── YES ──▶ [Tier 1 Clef Decision Model]
                    │             ├── noul > 0.90 ──▶ Return { decision: "allow" } ──▶ Task Completes
                    │             └── noul <= 0.90 ─▶ Return { decision: "continue", reason: "..." }
                    └── NO  ──▶ Return { decision: "allow" } ──▶ Task Completes
```

### Tier 0: Deterministic Filter (`src/checks.ts`, `decision/tier0.ts`)
- Fast, local, and sub-millisecond execution.
- Evaluates exit codes and error summaries from `package.json` build/test scripts and `tsconfig.json`.
- Detects recurring error signatures across iterations to prevent repetitive loops.
- Sets `ambiguous: true` when mechanical checks pass but semantic fulfillment must be confirmed.

### Tier 1: Semantic Intent Judge (`decision/tier1.ts`)
- Powered by Cloudflare's **Clef-Flash** (`Clef-Flash-Q4_K_M.gguf`, 6.49 GB, 9B Qwen3.5 backbone).
- Runs locally in GGUF format on `http://127.0.0.1:8000/v1/systemone` using a prebuilt `llama-server`.
- Evaluates the probability $P(\text{goal genuinely satisfied})$ via the `noul` decision primitive in a single forward pass without autoregressive text generation.
- Threshold gate: requires `noul > 0.90` (with a `[0.85, 0.90]` hysteresis dead-band) to approve completion.

---

## 4. Key Architectural Transitions

The project underwent two critical architectural evolutions:

### Evolution 1: Model Migration (Jev ──▶ Laya ──▶ Cloudflare Clef-Flash)
- **Initial Plan (Jev)**: Scoped around a proprietary hosted decision API (TypeSafe AI).
- **Interim Step (Laya)**: Swapped to an open-weight ModernBERT-large ONNX model (`@receptron/laya`). However, Laya had a restrictive ~512 token context window and native `node-gyp` dynamic library issues.
- **Production Choice (Cloudflare Clef-Flash)**: Adopted Cloudflare's 9B decision model with a **65,536 token context window**, sub-40ms latency, native `/v1/systemone` endpoint, and robust local GGUF quantization.

### Evolution 2: Structural Migration (External Wrapper ──▶ Native Antigravity Plugin)
- **Initial Prototype**: Designed as an external CLI wrapper (`wrapper/cli.ts`, `wrapper/agy.ts`, `wrapper/loop.ts`) that spawned `agy` as a child process via `execa` and looped externally.
- **Limitation**: Spawning `agy` repeatedly destroyed conversational context between iterations, broke IDE integration, and introduced heavy subprocess overhead.
- **Native Plugin Resolution**: Median was converted into an Antigravity Plugin. Antigravity acts as the host and invokes Median's `Stop` lifecycle hook. Rejections instruct the live agent to self-correct natively without restarting the process.

---

## 5. Hook Protocol & Data Contract

### Hook Request (`StopHookPayload`)
```typescript
export interface StopHookPayload {
    executionNum?: number;
    terminationReason?: string;
    error?: string;
    fullyIdle?: boolean;
    conversationId?: string;
    workspacePaths?: string[];
    transcriptPath?: string;
    artifactDirectoryPath?: string;
    modelName?: string;
}
```

### Hook Response (`StopHookResponse`)
```typescript
export interface StopHookResponse {
    decision: 'continue' | 'allow';
    reason?: string;
}
```

---

## 6. Guardrails & Safety Controls

1. **Loop Cap (`MAX_HOOK_ITERATIONS = 4`)**:
   Prevents infinite self-correction loops. If an agent fails checks 4 consecutive times, Median allows completion with an advisory warning.
2. **Transcript Project Resolution**:
   If Antigravity reports a broad workspace (e.g. `/home/user`), Median analyzes the agent's recent tool calls in `transcript.jsonl` to pinpoint the actual modified repository directory.
3. **Pure Q&A Bypass**:
   Informational queries (e.g. "explain how this works", "what is the git status") bypass code checks automatically.
4. **Multi-Level Manual Bypasses**:
   - Prompt-level: `--no-median`, `[skip-median]`, `(no-median)`.
   - Workspace-level: `.nomedian` flag file.
   - Environment-level: `MEDIAN_DISABLED=1`.
   - Global plugin CLI: `agy plugin disable median`.
