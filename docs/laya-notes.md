# Archived Model Notes: Laya (@receptron/laya)

> [!NOTE]
> **Status: ARCHIVED / REPLACED BY CLOUDFLARE CLEF-FLASH**
> This document records the technical findings from the earlier evaluation of `@receptron/laya`. The project has migrated to **Cloudflare Clef-Flash** running locally via `llama-server` GGUF.

---

## 1. Overview of the Evaluated Model

- **Package:** `@receptron/laya@0.1.2`
- **Underlying Architecture:** ModernBERT-large (~421M parameters) adapted for typed decision tasks.
- **Runtime:** ONNX Runtime (`onnxruntime-node: ^1.22.0`) and `@huggingface/tokenizers`.
- **Target Role:** Evaluated as a potential Tier 1 semantic decision model for judging goal fulfillment via `systemOne` `noul` scoring.

---

## 2. Key Limitations Identified During Verification

While `@receptron/laya` demonstrated typed decision primitives (`choice`, `score`, `noul`), several fundamental bottlenecks led to its replacement:

1. **Severe Context Window Constraint (~512 Tokens)**:
   - ModernBERT's effective context window was constrained to ~512 tokens.
   - Real-world software engineering tasks generate git diffs and requirements spanning thousands of tokens. Fitting complex code changes into 512 tokens required aggressive, lossy compaction, which blinded the model to multi-file diffs.

2. **Native Dependency & Platform Instability**:
   - `onnxruntime-node` requires downloading platform-specific native shared libraries during `npm install`.
   - On Linux systems (specifically NixOS or non-standard libc setups), native binary loading frequently produced dynamic linker errors (`libonnxruntime.so` not found or libc version mismatches).

3. **Limited Reasoning Capacity**:
   - At 421M parameters, subtle logical requirements (e.g., verifying boundary conditions, async error handling, or API contracts) were frequently misclassified.

---

## 3. Why Cloudflare Clef-Flash Succeeded Laya

| Dimension | Laya (ModernBERT-large) | Cloudflare Clef-Flash |
| :--- | :--- | :--- |
| **Parameter Scale** | 421M parameters | **9B parameters (Qwen3.5 backbone)** |
| **Context Window** | ~512 tokens | **65,536 tokens** (evaluates full multi-file diffs) |
| **Runtime** | Node.js ONNX Runtime native addon | Prebuilt **`llama-server` GGUF daemon** |
| **Latency** | ~50ms (CPU) | **~25-45ms (GPU / 4-bit quantized)** |
| **Stability** | Fragile native node-gyp bindings | Decoupled HTTP daemon on `/v1/systemone` |
