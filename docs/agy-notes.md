# Antigravity (AGY) Plugin & Lifecycle Hook Integration Notes

This document details the interface and interaction mechanisms between **Google Antigravity (`agy`)** and the **Median** plugin.

---

## 1. Antigravity Plugin Architecture

Rather than executing `agy` as an external subprocess, Median integrates natively into Antigravity via the **Antigravity Plugin System**:

- **Plugin Discovery Locations**:
  - Global: `~/.gemini/config/plugins/<plugin-name>`
  - Project-specific: `.agents/plugins/<plugin-name>`
- **Plugin Validation**:
  ```bash
  agy plugin validate /path/to/plugin
  ```
  Validates `plugin.json`, `hooks.json`, skills, rules, and command registrations.

---

## 2. The `Stop` Lifecycle Hook

Antigravity defines lifecycle events that plugins can intercept. Median utilizes the **`Stop` hook**:

### Trigger Event
Fired whenever an Antigravity agent attempts to conclude its trajectory (via `model_stop` or task completion).

### Communication Protocol
- **Transport**: Standard I/O (stdin / stdout).
- **Timeout**: Configurable in `hooks.json` (Median sets 60 seconds).
- **Input (stdin)**: Antigravity serializes the execution state into a JSON object:
  ```json
  {
    "executionNum": 0,
    "terminationReason": "model_stop",
    "workspacePaths": ["/path/to/project"],
    "transcriptPath": "/path/to/transcript.jsonl",
    "conversationId": "...",
    "fullyIdle": true
  }
  ```
- **Output (stdout)**: Median must return a JSON response adhering to `StopHookResponse`:
  ```json
  {
    "decision": "continue",
    "reason": "Median Quality Gate Failure: Tests failed (1/3 passed). Fix the failing test in tests/auth.test.ts"
  }
  ```
  or:
  ```json
  {
    "decision": "allow"
  }
  ```

### Agent Self-Correction Behavior
When `{ "decision": "continue" }` is emitted:
1. Antigravity prevents the agent from terminating.
2. The `reason` string is injected directly into the agent's active conversation context as a high-priority system notification.
3. The agent resumes execution, analyzes the failure description, and issues code edits or test updates to address the defect.

---

## 3. Rules & Skills Integration

1. **Agent Quality Standards ([`rules/AGENTS.md`](../rules/AGENTS.md))**:
   - Placed in the `rules/` directory of the plugin.
   - Automatically appended to the agent's system prompt whenever the plugin is active.
   - Instructs the agent to verify code before attempting to stop and to strictly heed Median's quality gate rejections.

2. **On-Demand Skill ([`skills/median-verify/SKILL.md`](../skills/median-verify/SKILL.md))**:
   - Exposes `median-verify` as an available skill.
   - Allows agents or users to run quality gate checks proactively during task execution rather than only waiting for the final `Stop` hook.

---

## 4. Plugin Management Commands

```bash
# Validate plugin structure
agy plugin validate /home/ms/median

# Enable / Disable plugin globally
agy plugin enable median
agy plugin disable median
```
