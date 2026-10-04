# Median: Autonomous Quality Gate & Verification Plugin for Antigravity

**Median** is an autonomous two-tier verification plugin for **Google Antigravity (`agy`)**. Instead of allowing AI coding agents to declare victory with broken builds, failing unit tests, or incomplete requirements, Median intercepts completion attempts, verifies the workspace, and commands the agent to self-correct until the quality gate passes.

---

## Architecture: Native Antigravity Plugin

Median operates directly inside Antigravity via lifecycle hooks rather than as an external runner:

```
User Task ──▶ Antigravity Agent Working
                     │
                     ▼
           Agent Attempts Stop (model_stop)
                     │
                     ▼
       ┌───────────────────────────────┐
       │   Median Stop Lifecycle Hook  │
       │     (dist/bin/hook.js)        │
       └──────────────┬────────────────┘
                      │
                      ▼
       ┌───────────────────────────────┐
       │      Tier 0 Quality Gate      │
       │   - Build (`npm run build`)   │
       │   - Tests (`vitest` / `jest`) │
       │   - Typecheck (`tsc --noEmit`)│
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

---

## Capabilities

1. **Native `Stop` Lifecycle Hook (`hooks.json`)**:
   - Automatically intercepts the agent upon completion (`model_stop`).
   - Parses active workspace paths and extracts the task goal from the conversation transcript.
   - Detects pure informational queries (Q&A, explanations) and bypasses quality checks automatically.
   - Rejects premature task completion by returning `{ "decision": "continue", "reason": "<diagnostics>" }`, injecting actionable fix instructions directly into the agent's context.

2. **Autonomous Two-Tier Quality Gate**:
   - **Tier 0 (Deterministic Gate)**: Validates build scripts, unit test execution, and TypeScript compiler errors in sub-millisecond time.
   - **Tier 1 (Semantic Clef Decision Engine)**: Evaluates git diffs against task goals using Cloudflare's **Clef-Flash** (9B parameter multimodal decision model) to catch empty stubs, mock passes, and missed requirements.

3. **Agent Rules & Skills**:
   - **Rules ([`rules/AGENTS.md`](rules/AGENTS.md))**: Injects quality standards directly into the agent's system prompt.
   - **Skills ([`skills/median-verify/`](skills/median-verify/SKILL.md))**: Provides an autonomous verification skill that agents can invoke on demand during planning and execution.

4. **Programmatic TypeScript SDK**:
   - Exported library APIs (`handleStopHook`, `evaluateTier0`, `tier1Judge`, `runChecks`, `getWorkspaceDiff`).
   - Can be integrated into custom agent workflows, CI/CD pipelines, or verification harnesses.

---

## Local Clef-Flash Decision Engine

Median integrates with Cloudflare's **Clef-Flash** decision model running locally via `llama-server` in 4-bit GGUF format (`Clef-Flash-Q4_K_M.gguf`, ~5.2 GB VRAM):

### Managing the Clef Daemon
```bash
# 1. Download model (~6.48 GB, supports resume)
npm run download:model

# 2. Start Clef server in background (runs on port 8000)
./scripts/clef_daemon.sh start

# Check server status & health
./scripts/clef_daemon.sh status

# Follow real-time decision logs
./scripts/clef_daemon.sh logs

# Stop server
./scripts/clef_daemon.sh stop
```

### Auto-Discovery
When Median's plugin hook triggers, it automatically probes `http://127.0.0.1:8000/health`. If the server is active, it queries `http://127.0.0.1:8000/v1/systemone` using single forward-pass probability scoring (`noul`). If the daemon is inactive, Median safely falls back to Tier 0 mechanical checks without blocking agent execution.

---

## Quick Start: Installing the Plugin

### 1. Build Median
```bash
npm install
npm run build
npm test

# (Optional, for Tier 1 local decision model): Download Clef-Flash GGUF (~6.48 GB)
npm run download:model
```

### 2. Validate Plugin Configuration
```bash
agy plugin validate .
```
Expected output: `[ok] . ✔ skills : 1 processed, ✔ hooks : 1 processed`.

### 3. Install in Antigravity
You can install Median globally or per workspace:

```bash
# Global install:
agy plugin install /path/to/median
agy plugin enable median

# Or link directly to user config plugins:
ln -s /path/to/median ~/.gemini/config/plugins/median
```

Once installed, simply use `agy` or the Antigravity IDE as usual. Median runs automatically in the background on every `model_stop` event.

---

## Manual Bypass Controls

You can bypass Median whenever you need rapid prototyping, exploratory work, or non-code tasks:

| Method | Syntax | Scope |
| :--- | :--- | :--- |
| **Prompt Flag** | `agy "Create draft --no-median"` or `[skip-median]` | Single task |
| **Workspace Flag** | `touch .nomedian` | Active repository |
| **Environment Var**| `export MEDIAN_DISABLED=1` | Current terminal session |
| **CLI Plugin Command** | `agy plugin disable median` | Global Antigravity config |

---

## Programmatic SDK Usage

```typescript
import { handleStopHook, evaluateTier0, runChecks } from 'median';

// Run deterministic workspace checks
const checks = await runChecks('/path/to/project');

// Run full Stop hook logic programmatically
const response = await handleStopHook({
    workspacePaths: ['/path/to/project'],
    executionNum: 0
});

console.log(response.decision); // 'allow' | 'continue'
if (response.decision === 'continue') {
    console.log(response.reason);   // Specific fix instruction for the agent
}
```

---

## License

ISC License.
