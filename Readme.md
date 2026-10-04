# Median: Autonomous Quality Gate & Verification for Antigravity (AGY)

**Median** is a two-tier verification engine and plugin for `agy-cli`. Instead of allowing an AI coding agent to mark a task as "done" with broken builds or failing tests, Median intercepts completion attempts, evaluates the workspace, and instructs the agent to self-correct until the quality gate passes.

---

## Capabilities

1. **Native `agy-cli` Plugin**:
   - Integrates via Antigravity's **`Stop` lifecycle hook** (`hooks.json`).
   - Automatically intercepts the agent when it attempts to finish (`model_stop`).
   - Runs deterministic build, test, and type checks (Tier 0).
   - If checks fail, rejects the completion with targeted fix instructions.
   - Includes interactive skills (`skills/median-verify/`) and agent quality rules (`rules/AGENTS.md`).

2. **Programmatic TypeScript/Node SDK**:
   - Clean library exports (`evaluateTier0`, `tier1Judge`, `runChecks`, `handleStopHook`).
   - Can be embedded in CI/CD pipelines, custom orchestrators, or local developer scripts.

3. **Standalone Verification CLI**:
   - Fallback CLI (`node dist/wrapper/cli.js "<goal>"`) for headless non-interactive runs.

---

## Two-Tier Architecture

```
Agent Attempts Stop (model_stop)
             │
             ▼
   [Stop Lifecycle Hook]
             │
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
                    ├── YES ──▶ [Tier 1 Clef Decision Model] ──▶ Pass/Fail
                    └── NO  ──▶ Return { decision: "allow" } ──▶ Task Completes
```

---

## Local Clef-Flash Decision Engine

Median integrates with Cloudflare's **Clef-Flash** (9B multimodal decision model) running locally via `llama-server` in GGUF format (`Clef-Flash-Q4_K_M.gguf`).

### Managing the Server
```bash
# Start Clef server in background
./scripts/clef_daemon.sh start

# Check server status & health
./scripts/clef_daemon.sh status

# View live decision logs
./scripts/clef_daemon.sh logs

# Stop server
./scripts/clef_daemon.sh stop
```

### Auto-Discovery
When Median's plugin hook triggers, it automatically probes `http://127.0.0.1:8000/health`. If the server is active, it queries `http://127.0.0.1:8000/v1/systemone` without needing manual environment variables. If the server is off, it safely falls back to Tier 0 clean verdict.

---

## Quick Start: Installing the Plugin in `agy`

### 1. Build the plugin
```bash
npm install
npm test
npm run build
```

### 2. Validate the plugin
```bash
agy plugin validate .
```

### 3. Use in your project
You can use Median in any workspace by linking or installing it:
```bash
# Per-project workspace plugin:
mkdir -p .agents/plugins/
cp -r /path/to/median .agents/plugins/median

# Or install globally:
agy plugin install /path/to/median
agy plugin enable median
```

Once installed, use `agy` as you normally would. Median runs silently in the background and only activates when an agent attempts to conclude with broken code or failing tests.

---

## Programmatic SDK Usage

```typescript
import { handleStopHook, evaluateTier0, runChecks } from 'median';

// Run workspace checks
const checks = await runChecks('/path/to/project');

// Evaluate state
const decision = evaluateTier0({
    goal: "Implement user authentication",
    iterationCount: 1,
    currentCodeState: "diff ...",
    executionErrors: [],
    errorSignature: "",
    previousErrorSignature: "",
    checks,
    verifiedRequirements: []
});

console.log(decision.phase); // 'done' | 'refine'
```
