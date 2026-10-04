# Historical Specification: Standalone AGY CLI Wrapper (Superseded)

> [!NOTE]
> **Status: SUPERSEDED**
> This document records the initial prototype specification for Median when it was envisioned as an external CLI wrapper around `agy`. Median has since transitioned to a **native Antigravity Plugin** using lifecycle hooks (`Stop`). This file is preserved for historical reference and architectural traceability.

---

## 1. Initial Prototype Concept

The original goal was to build a standalone command-line wrapper (`median "<goal>"`) that would:
1. Accept a user goal from the terminal.
2. Spawn `agy` as a child process using `agy --print "<goal>" --output-format text`.
3. Capture the output and execute deterministic build and test checks.
4. If checks failed, run an external loop re-invoking `agy` with fix instructions up to a retry cap (4 iterations).
5. If still failing, write an escalation report to disk.

---

## 2. Why the Outer CLI Model Was Deprecated

During development and testing, several severe architectural limitations of the external wrapper approach emerged:

1. **Subprocess Overhead & Lost Conversation Context**:
   - Spawning `agy` repeatedly via `execa` treated each iteration as a cold, stateless one-shot generation.
   - The agent lost its intermediate scratchpad, tool call history, and active thought process between iterations.

2. **Inverted Architecture (Outside-In vs Inside-Out)**:
   - Antigravity already has an internal agentic loop and rich lifecycle hook system (`hooks.json`).
   - Running an outer loop outside `agy` duplicated Antigravity's own orchestrator and prevented integration with IDEs or interactive chat sessions.

3. **Poor User Experience**:
   - Users had to run a separate binary (`median`) instead of using their standard `agy` CLI or Antigravity IDE workflow.
   - It broke native features like interactive subagents, slash commands, and multi-workspace support.

---

## 3. Transition to the Native Plugin Architecture

By transforming Median into an **Antigravity Plugin**:

| Feature | Legacy Wrapper Spec | Modern Plugin Architecture |
| :--- | :--- | :--- |
| **Execution Point** | Outer process wrapping `agy` | Registered lifecycle hook (`Stop`) inside `agy` |
| **Retry Mechanism** | Node.js `while` loop spawning `execa` | Antigravity native `{ "decision": "continue" }` rejection |
| **Context Retention** | Lost across process restarts | Preserved seamlessly in active agent session |
| **Diagnostics** | Written to external `escalation/` files | Injected directly into live agent context |
| **UI Compatibility** | Terminal-only CLI script | Works in `agy` CLI, Antigravity IDE, & background tasks |
| **Verification Gate** | Tier 0 checks only | Two-Tier: Tier 0 Deterministic + Tier 1 Clef-Flash |
