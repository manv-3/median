# Median Plugin Integration & Operation Guide

This guide provides a comprehensive technical overview of **Median** as an Antigravity Plugin, explaining how it intercepts agent completion attempts, evaluates code quality via deterministic checks and Cloudflare's Clef-Flash decision model, and communicates with the agent.

---

## 1. Architectural Philosophy: Inversion of Control

Earlier prototypes of Median attempted to wrap `agy` from the outside (executing `agy` as a child process in a loop). Median has evolved into a native **Antigravity Plugin**:

- **Host Process**: `agy` (or Antigravity IDE) runs as the host environment.
- **Plugin Role**: Median is loaded into `agy` via standard plugin discovery (`hooks.json`, `rules/AGENTS.md`, `skills/median-verify/`).
- **Control Mechanism**: Antigravity executes Median's `Stop` lifecycle hook whenever an agent attempts to stop (`model_stop`).
- **Self-Correction Loop**: When checks fail, Median returns `{ "decision": "continue", "reason": "<instructions>" }`. Antigravity's internal planner receives this rejection and commands the agent to self-correct within the live conversation trajectory.

---

## 2. Plugin Structure & Discovery

Median follows the official Antigravity plugin layout:

```
median/
├── plugin.json                 # Plugin manifest (name, description)
├── hooks.json                  # Hook registration (Stop lifecycle hook)
├── bin/
│   └── hook.ts                 # CLI entry point for the Stop hook (reads stdin, outputs stdout)
├── src/
│   ├── hook-handler.ts         # Hook logic, transcript parsing, bypasses, checks orchestration
│   ├── transcript.ts           # Goal extraction & active project detection from transcript
│   ├── checks.ts               # Tier 0 workspace build, test, and typecheck runners
│   └── index.ts                # TypeScript SDK exports
├── decision/
│   ├── tier0.ts                # Tier 0 deterministic scoring & ambiguity detection
│   └── tier1.ts                # Tier 1 Clef-Flash client (System One typed API)
├── rules/
│   └── AGENTS.md               # Quality rules automatically injected into the agent system prompt
├── skills/
│   └── median-verify/          # On-demand verification skill for agent planning
├── scripts/
│   ├── clef_daemon.sh          # Background daemon management script for Clef-Flash
│   └── download_clef_gguf.sh   # Automated GGUF model downloader
└── models/
    └── Clef-Flash-Q4_K_M.gguf  # 4-bit quantized Clef-Flash model weights
```

### Manifests:
- **`plugin.json`**:
  ```json
  {
    "name": "median",
    "description": "Two-tier autonomous quality gate and verification engine for Antigravity"
  }
  ```
- **`hooks.json`**:
  ```json
  {
    "median-quality-gate": {
      "Stop": [
        {
          "type": "command",
          "command": "node ./dist/bin/hook.js",
          "timeout": 60
        }
      ]
    }
  }
  ```

---

## 3. The Stop Hook Lifecycle

### Input Payload (stdin)
Antigravity passes the execution state to `dist/bin/hook.js` over `stdin` as JSON:

```json
{
  "executionNum": 0,
  "terminationReason": "model_stop",
  "workspacePaths": ["/home/ms/my-project"],
  "transcriptPath": "/home/ms/.gemini/antigravity-cli/brain/.../transcript.jsonl",
  "conversationId": "...",
  "fullyIdle": true
}
```

### Handler Workflow (`src/hook-handler.ts`)
1. **Bypass Checks**:
   - Environment variable `MEDIAN_DISABLED=1`.
   - File flag `.nomedian` in the target workspace.
   - Command-line prompt bypass flags (`--no-median`, `[skip-median]`, `(no-median)`).
   - Informational query detection (e.g., questions asking "explain", "how do I", "status", etc., which do not alter code).
2. **Active Project Detection**:
   - If `workspacePaths` contains a generic root (such as `/home/user`), Median parses `transcript.jsonl` to locate the actual project directory being modified (e.g., `/home/user/my-project`).
3. **Loop Safety**:
   - Tracks consecutive rejections in the session. If `executionNum >= 4`, Median permits completion with an advisory note to prevent infinite loops.
4. **Tier 0 Deterministic Checks (`src/checks.ts`)**:
   - Checks `npm run build` or `tsc --noEmit`.
   - Checks `npm test` / `vitest` pass/fail status.
   - Counts TypeScript compiler errors.
   - If any check fails, returns `{ "decision": "continue", "reason": "Median Quality Gate Failure: ..." }`.
5. **Tier 1 Clef Decision Engine (`decision/tier1.ts`)**:
   - Evaluates whether the workspace git diff genuinely satisfies the user's goal.
   - Auto-discovers local `llama-server` on `http://127.0.0.1:8000`.
   - Queries `http://127.0.0.1:8000/v1/systemone` using the `noul` primitive.
   - If `noul > 0.90`, returns `{ "decision": "allow" }`.
   - If `noul <= 0.90`, returns `{ "decision": "continue", "reason": "Goal fulfillment requirement not satisfied..." }`.

---

## 4. Cloudflare Clef-Flash Integration

Median integrates with Cloudflare's **Clef-Flash** (9B parameter model tuned for System One decision-making).

### Daemon Management
The local daemon is managed with `scripts/clef_daemon.sh`:
```bash
./scripts/clef_daemon.sh start    # Starts llama-server in background
./scripts/clef_daemon.sh status   # Checks health on port 8000
./scripts/clef_daemon.sh logs     # Follows decision logs
./scripts/clef_daemon.sh stop     # Gracefully shuts down the daemon
```

### Native `/v1/systemone` Schema
Clef evaluates decisions in a single forward pass without generating free-form tokens:

```json
{
  "state": {
    "goal": "Add JWT authentication to login route",
    "diff": "diff --git a/auth.ts b/auth.ts ...",
    "verifiedRequirements": ["jwt.sign", "jwt.verify"]
  },
  "questions": {
    "satisfied": {
      "type": "noul",
      "instructions": "Determine whether the code diff genuinely implements the stated goal.",
      "criteria": {
        "true": "The code diff correctly satisfies and implements the requested goal.",
        "false": "The code diff does not implement the requested goal or only partially implements it."
      }
    }
  }
}
```

Response:
```json
{
  "answers": {
    "satisfied": {
      "type": "noul",
      "noul": 0.9421
    }
  }
}
```

---

## 5. Verification & Testing

Validate the plugin before installation:

```bash
# 1. Unit tests & type checking
npm test
npm run build

# 2. Antigravity plugin validation
agy plugin validate /home/ms/median

# 3. Direct hook simulation
echo '{"executionNum": 0, "workspacePaths": ["/home/ms/median"]}' | node dist/bin/hook.js
```
