# Integrating Cloudflare Clef-Flash with the Median Plugin

This guide explains how Cloudflare's **Clef-Flash** decision model is integrated into the **Median** Antigravity plugin, how to operate it, and how it enforces code quality.

---

## 1. Overview

**Median** acts as an autonomous quality gate for `agy` coding agents. Rather than relying solely on deterministic checks (syntax, builds, unit tests), Median uses a two-tier evaluation standard:

- **Tier 0 (Deterministic Gate)**: Evaluates exit codes from `npm run build`, `npm test` / `vitest`, `tsc --noEmit`, and linters.
- **Tier 1 (Semantic Clef Decision Gate)**: Evaluates whether the workspace code diff genuinely implements the user's requested goal (eliminating empty stubs, mock passes, or omitted requirements).

---

## 2. Clef-Flash Architecture

- **Model**: `ggml-org/Clef-Flash-GGUF` (`Clef-Flash-Q4_K_M.gguf`, 6.49 GB, 587 tensors).
- **Engine**: Prebuilt `llama-server` (build 11396) running with native `/v1/systemone` System One typed decision API support.
- **Decision Mode**: Single forward-pass probability scoring (`noul`) without free-form text generation or output hallucination.

---

## 3. Server Management

Median includes a daemon management script:

```bash
# Check if Clef server is running
./scripts/clef_daemon.sh status

# Start Clef server in background
./scripts/clef_daemon.sh start

# Follow real-time decision logs
./scripts/clef_daemon.sh logs

# Stop Clef server
./scripts/clef_daemon.sh stop
```

---

## 4. How the Plugin Intercepts Antigravity Agents

1. **Registration**:
   [`hooks.json`](file:///home/ms/median/hooks.json) registers the `Stop` lifecycle hook:
   ```json
   {
     "hooks": {
       "Stop": [
         {
           "command": "node dist/bin/hook.js",
           "type": "command"
         }
       ]
     }
   }
   ```

2. **Execution**:
   Whenever an agent tries to conclude a task (`model_stop`), Antigravity executes `dist/bin/hook.js`:
   - `handleStopHook` in [`src/hook-handler.ts`](file:///home/ms/median/src/hook-handler.ts) executes.
   - It runs workspace checks (`runChecks`).
   - If checks pass, it evaluates Tier 1 via `tier1Judge` in [`decision/tier1.ts`](file:///home/ms/median/decision/tier1.ts).
   - If Clef returns `noul > 0.90`, the hook permits completion (`{"decision": "allow"}`).
   - If Clef returns `noul <= 0.90`, the hook blocks completion (`{"decision": "continue"}`) and injects Clef's targeted fix instruction into the agent's context.

3. **Auto-Discovery**:
   Median automatically checks `http://127.0.0.1:8000/health`. If the local Clef daemon is running, it routes decisions to `http://127.0.0.1:8000/v1/systemone`. No environment variables are required.

---

## 5. Enabling & Disabling Median Manually

You can toggle or bypass Median at multiple levels depending on your workflow:

### A. Inline in Prompts / Chat (Per Task)
Add `--no-median`, `[skip-median]`, or `(no-median)` directly to any task or question:
```bash
agy "Generate a scratch demo script --no-median"
```
Or in the chat interface:
> *"Write a quick draft [skip-median]"*

### B. Per Terminal Session (Environment Variable)
Disable Median for your current shell:
```bash
export MEDIAN_DISABLED=1
```
Re-enable it anytime:
```bash
unset MEDIAN_DISABLED
```
Or for a single one-off command:
```bash
MEDIAN_DISABLED=1 agy "quick task without quality gate"
```

### C. Per Project Workspace (Flag File)
To permanently bypass Median in a quick scratch or prototype repository:
```bash
touch .nomedian
```
Delete `.nomedian` when you are ready to enforce quality checks.

### D. Globally via `agy` CLI
```bash
agy plugin disable median   # Disable globally across all workspaces
agy plugin enable median    # Re-enable globally
```

---

## 6. Verification

To verify the entire pipeline:
```bash
# 1. Build and test Median
npm run build
npm test

# 2. Validate plugin registration with agy
agy plugin validate /home/ms/median

# 3. Test hook directly
echo '{"executionNum": 0, "workspacePaths": ["/home/ms/median"]}' | node dist/bin/hook.js
```
