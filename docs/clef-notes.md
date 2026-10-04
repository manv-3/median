# Cloudflare Clef-Flash Architecture & Operation Notes

This document provides the technical reference for Cloudflare's **Clef-Flash** model integration in Median.

---

## 1. Model Overview

- **Model Identifier:** `Cloudflare/clef-flash` (Hugging Face) / `ggml-org/Clef-Flash-GGUF`
- **Base Architecture:** Qwen3.5-9B multimodal backbone with a joint decision head
- **Role in Median:** Powers **Tier 1 (Semantic Quality Gate)** when Tier 0 deterministic checks are clean but intent verification is required.
- **License:** Apache 2.0 (Open Weights)
- **Context Window:** **65,536 tokens** (allowing large git diffs, file context, and requirements to be evaluated without aggressive truncation).
- **Inference Mode:** **Prefill-Only / System One**. Clef does not perform autoregressive token-by-token text generation. It computes calibrated probabilities over structured schema criteria in a single forward pass.
- **Decision Latency:** ~25ms – 45ms median inference time on modern GPU hardware.

---

## 2. Quantization & Hardware Footprint

Median uses the official 4-bit medium quantized checkpoint (`Clef-Flash-Q4_K_M.gguf`):

| File | Precision | File Size | VRAM Needed | Target Hardware |
| :--- | :--- | :--- | :--- | :--- |
| **`Clef-Flash-Q4_K_M.gguf`** | `Q4_K_M` | **6.49 GB** | **~5.2 – 5.5 GB** | **RTX 3050 6GB, RTX 3060/4060, Apple Silicon (M1/M2/M3)** |
| `Clef-Flash-Q8_0.gguf` | `Q8_0` | ~9.8 GB | ~9.5 – 10.5 GB | RTX 3060 12GB, RTX 4070 |
| Full Weights | `BF16` | ~18.5 GB | ~19 – 21 GB | RTX 3090, RTX 4090, A100 |

Because inference is prefill-only and generates no subsequent output tokens, VRAM does not grow dynamically during inference (zero KV-cache inflation).

---

## 3. Local Runtime: `llama-server` System One

Median runs Clef locally using a prebuilt, high-performance `llama-server` binary with native `/v1/systemone` support.

### Daemon Management (`scripts/clef_daemon.sh`)
```bash
# Start Clef server in background on port 8000
./scripts/clef_daemon.sh start

# Query health status and verify model loading
./scripts/clef_daemon.sh status

# Follow real-time decision evaluations
./scripts/clef_daemon.sh logs

# Gracefully terminate daemon
./scripts/clef_daemon.sh stop
```

The daemon stores its process ID in `.clef_server.pid` and writes stdout/stderr to `.clef_server.log`.

---

## 4. API Request & Response Shapes

### Request: `POST /v1/systemone`
```json
{
  "state": {
    "goal": "Implement binary search tree with insert and search methods",
    "diff": "diff --git a/bst.ts b/bst.ts\n+export class BST { ... }",
    "verifiedRequirements": ["insert", "search"]
  },
  "questions": {
    "satisfied": {
      "type": "noul",
      "instructions": "Determine whether the code diff genuinely implements the stated goal. Answer false if the code is an empty stub or omits core requirements.",
      "criteria": {
        "true": "The code diff correctly satisfies and implements the requested goal.",
        "false": "The code diff does not implement the requested goal or only partially implements it."
      }
    }
  }
}
```

### Response
```json
{
  "answers": {
    "satisfied": {
      "type": "noul",
      "noul": 0.9388
    }
  },
  "usage": {
    "prompt_tokens": 342,
    "completion_tokens": 0
  }
}
```

---

## 5. Scoring & Thresholds in Median

In [`decision/tier1.ts`](../decision/tier1.ts), the probability `noul` is evaluated against calibrated boundaries:

- **`RAW_DONE_THRESHOLD = 0.90`**:
  - `noul >= 0.90`: Goal is satisfied (`phase: 'done'`). Stop hook returns `{ "decision": "allow" }`.
  - `noul < 0.90`: Goal is incomplete or unfulfilled (`phase: 'refine'`). Stop hook returns `{ "decision": "continue", "reason": "Goal fulfillment score: ..." }`.
- **Hysteresis Dead-Band `[0.85, 0.90]`**: Prevents jitter on borderline passes across iterations.
- **Fail-Safe Fallback**: If `llama-server` is not running and no Cloudflare Workers AI credentials are configured, Median logs a warning and falls back to Tier 0 deterministic results without crashing.
