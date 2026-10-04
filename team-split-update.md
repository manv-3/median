# Architectural Evolution & Transition Record

This document records the architectural transitions of the **Median** project from early concepts to the current native Antigravity Plugin.

---

## 1. Summary of Architectural Transitions

### Phase 1: The External CLI Prototype (Superseded)
- **Concept:** Median was initially designed as an external CLI (`node dist/wrapper/cli.js "<goal>"`) that spawned `agy` as a child process via `execa`.
- **Limitation:** Executing `agy` as a one-shot child process destroyed conversation state, broke interactive IDE sessions, and required an artificial outer retry loop (`wrapper/loop.ts`).
- **Initial Model Choice:** Evaluated Jev (hosted) and Laya (ModernBERT-large ONNX). Laya suffered from a restrictive ~512 token context window and native `onnxruntime-node` binary loading issues on Linux.

### Phase 2: The Native Antigravity Plugin Pivot (Current)
- **Plugin Manifests:** Implemented [`plugin.json`](plugin.json) and [`hooks.json`](hooks.json) registering the `Stop` lifecycle hook.
- **In-Session Self-Correction:** When quality checks fail, Median returns `{ "decision": "continue", "reason": "..." }`. Antigravity catches this rejection natively and forces the agent to self-correct within the live conversation trajectory.
- **Model Upgrade (Cloudflare Clef-Flash):** Upgraded to Cloudflare's **Clef-Flash** (9B multimodal decision model) running locally via `llama-server` in GGUF format (`Clef-Flash-Q4_K_M.gguf`), providing a **65,536 token context window** and sub-40ms single forward-pass probability scoring (`noul`).
- **Workspace Checks Consolidation:** Migrated `wrapper/checks.ts` into [`src/checks.ts`](src/checks.ts), decoupling the core plugin from the deprecated wrapper directory.
- **Agent Rules & Skills:** Integrated [`rules/AGENTS.md`](rules/AGENTS.md) and [`skills/median-verify/`](skills/median-verify/SKILL.md) for continuous agent alignment.
