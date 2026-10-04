# File Details & Repository Inventory

This document provides a comprehensive inventory of every component in the **Median** repository, explaining its purpose, dependencies, and operational role.

---

## 1. Root Configuration & Plugin Manifests

### `plugin.json`
- **Role:** Antigravity plugin manifest.
- **Contents:** Declares the plugin name (`median`) and description for plugin discovery and registration (`agy plugin validate`).

### `hooks.json`
- **Role:** Antigravity lifecycle hook registration.
- **Contents:** Maps the `Stop` event to `dist/bin/hook.js` with a 60-second execution timeout. Whenever an Antigravity agent attempts to complete a task (`model_stop`), Antigravity invokes this script.

### `package.json`
- **Role:** Node.js project manifest (ESM-only, `"type": "module"`).
- **Scripts:** `build` (`tsc`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`).
- **Dependencies:** `execa` (subprocess runner), `typescript`.
- **DevDependencies:** `@types/node`, `tsx`, `vitest`.
- **Bin:** Points `"median-hook"` to `dist/bin/hook.js`.

### `tsconfig.json`
- **Role:** TypeScript compiler configuration.
- **Settings:** Target `ES2022`, module `NodeNext`, strict type checking enabled, includes `src/`, `bin/`, `decision/`, and `types/`.

### `shell.nix`
- **Role:** Reproducible development environment for Nix / NixOS users, providing Node.js 22, Git, and Llama server utilities.

---

## 2. Plugin Entry Point (`bin/`)

### `bin/hook.ts`
- **Role:** CLI executable invoked by Antigravity on `Stop` events.
- **Operation:**
  1. Reads `stdin` to capture the JSON payload passed by Antigravity (`StopHookPayload`).
  2. Forwards the payload to `handleStopHook()` in `src/hook-handler.ts`.
  3. Formats and writes the resulting JSON (`StopHookResponse`) to `stdout`.
  4. Implements fail-safe error handling to ensure Antigravity is never blocked if an unhandled exception occurs.

---

## 3. Host Integration & Core Engine (`src/`)

### `src/hook-handler.ts`
- **Role:** Orchestrates the verification lifecycle upon intercepting a `Stop` event.
- **Operation:**
  1. **Bypass Checks:** Inspects `MEDIAN_DISABLED=1`, `.nomedian` flag file, and prompt bypass flags (`--no-median`).
  2. **Informational Query Bypass:** Detects pure Q&A queries and skips code checks.
  3. **Active Project Resolution:** Analyzes `transcript.jsonl` to identify the subproject folder if the workspace path is generic.
  4. **Safety Cap:** Limits rejections to 4 iterations per session to prevent infinite loops.
  5. **Tier 0 Invocation:** Executes `runChecks()` on the target project.
  6. **Tier 1 Invocation:** If mechanical checks pass but semantic verification is needed, queries Clef-Flash via `tier1Judge()`.
  7. **Response Formulation:** Returns `{ decision: "allow" }` or `{ decision: "continue", reason: "..." }`.

### `src/checks.ts`
- **Role:** Deterministic Tier 0 workspace verification.
- **Functions:**
  - `runChecks(workspacePath)`: Executes `npm run build` (or `tsc`), `npm test` (or `vitest`), and counts TypeScript compiler errors.
  - `getWorkspaceDiff(workspacePath)`: Captures uncommitted modifications (`git diff HEAD`), staged changes, or recent unpushed commits (`git log -p -n 8`).

### `src/transcript.ts`
- **Role:** Antigravity transcript analysis.
- **Functions:**
  - `extractGoalFromTranscript(transcriptPath)`: Extracts the primary task prompt from `USER_INPUT` steps.
  - `extractActiveProjectFromTranscript(transcriptPath, rootPath)`: Scans tool call arguments in the conversation trajectory to locate the specific sub-repository being edited.

### `src/index.ts`
- **Role:** Public TypeScript SDK exports (`handleStopHook`, `runChecks`, `evaluateTier0`, `tier1Judge`, etc.).

### `src/hook-handler.test.ts`
- **Role:** Unit test suite for `handleStopHook`, mocking checks, bypasses, and Clef decisions.

---

## 4. Decision Engine (`decision/`)

### `decision/tier0.ts`
- **Role:** Deterministic rule engine for Tier 0 evaluation.
- **Operation:** Evaluates build status, test pass ratio, and compiler errors. Calculates a composite score, detects repeating error signatures, and flags `ambiguous: true` when Tier 1 evaluation is warranted.

### `decision/tier1.ts`
- **Role:** Client interface for the Cloudflare Clef-Flash decision model.
- **Operation:** Auto-discovers local `llama-server` on `http://127.0.0.1:8000`. Posts a structured `noul` question to `/v1/systemone` and evaluates the returned probability against `RAW_DONE_THRESHOLD = 0.90`.

### `decision/tier0.test.ts` & `decision/tier1.test.ts`
- **Role:** Vitest suites validating deterministic scoring, threshold cutoffs, hysteresis, and mock Clef responses.

---

## 5. Agent Standards & Skills (`rules/` & `skills/`)

### `rules/AGENTS.md`
- **Role:** Antigravity agent system instructions.
- **Contents:** Instructs coding agents to verify tests and builds before attempting to complete tasks and to treat Median rejection feedback as high-priority instructions.

### `skills/median-verify/SKILL.md`
- **Role:** Interactive Antigravity skill.
- **Contents:** Allows agents to run quality gate checks proactively during planning or intermediate implementation phases.

---

## 6. Clef Runtime Management (`scripts/` & `models/`)

### `scripts/clef_daemon.sh`
- **Role:** Management script for the local Clef `llama-server` instance (`start`, `stop`, `status`, `logs`).

### `scripts/download_clef_gguf.sh`
- **Role:** Automated script to download `Clef-Flash-Q4_K_M.gguf` from Hugging Face into `models/`.

### `models/Clef-Flash-Q4_K_M.gguf`
- **Role:** 4-bit quantized model weights for Cloudflare Clef-Flash (6.49 GB).

---

## 7. Types (`types/`)

### `types/index.ts`
- **Role:** Core data contracts (`Checks`, `StatePayload`, `DecisionResult`, `Phase`, etc.).

### `types/clef.ts`
- **Role:** Strongly-typed interfaces for System One request/response payloads (`SystemOneRequest`, `NoulAnswer`, etc.).

---

## 8. Status of `wrapper/` (Legacy Outer-Loop Prototype)

The `wrapper/` directory represents Median's initial prototype as an external CLI runner:
- **`wrapper/checks.ts`**: Migrated to `src/checks.ts`. (The file in `wrapper/` now simply re-exports from `src/checks.ts` for backward compatibility).
- **`wrapper/agy.ts`, `wrapper/loop.ts`, `wrapper/cli.ts`, `wrapper/escalation.ts`**: Legacy files designed to spawn `agy` as a child process and retry externally. Superseded by the native Antigravity Plugin hook architecture.
