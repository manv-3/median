# Model Context: Cloudflare Clef-Flash System One

This document details the machine learning architecture, runtime engine, and inference protocol powering **Tier 1 (Semantic Quality Gate)** in Median.

---

## 1. What Clef-Flash Is

**Clef-Flash** is an open-weight decision model family released by Cloudflare on October 1, 2026.
Unlike traditional text-generating LLMs that produce conversational prose or code completions token-by-token, Clef-Flash is a **System One Decision Model**:
- It accepts a structured state description (user goal, code diff, verified requirements).
- It scores predefined typed decision questions (`noul`, `choice`, `score`).
- It outputs calibrated mathematical probabilities in a single forward pass without autoregressive text generation.

### Key Specifications:
- **Base Architecture:** Qwen3.5-9B multimodal backbone paired with a joint decision head.
- **Model Checkpoint:** `ggml-org/Clef-Flash-GGUF` (`Clef-Flash-Q4_K_M.gguf`, 6.49 GB, 587 tensors).
- **Context Window:** **65,536 tokens** (allowing large multi-file diffs and task specifications without lossy truncation).
- **Inference Latency:** ~25ms – 45ms median forward-pass time on local GPU.
- **VRAM Footprint:** ~5.2 – 5.5 GB in 4-bit medium quantization, fitting comfortably on consumer 6GB GPUs (RTX 3050/4060) and Apple Silicon.

---

## 2. Role in Median (Tier 1 Semantic Judge)

In Median's two-tier architecture, Clef-Flash is invoked **only when Tier 0 flags `ambiguous: true`**:
1. When builds or unit tests fail, Tier 0 rejects completion instantly without calling the model.
2. When builds and tests pass, Tier 0 checks if semantic fulfillment must be confirmed (e.g. non-empty diff, complex task).
3. If confirmation is needed, Clef-Flash evaluates whether the code diff genuinely satisfies the user's requested goal, catching empty stubs, mock passes, and omitted requirements.

---

## 3. The `noul` Primitive & Scoring Protocol

Clef evaluates a single `noul` question posted to `/v1/systemone`:

### Request Shape
```json
{
  "state": {
    "goal": "Implement JWT authentication middleware with unit tests",
    "diff": "diff --git a/src/middleware/jwt.ts b/src/middleware/jwt.ts ...",
    "verifiedRequirements": ["jwt.sign", "jwt.verify", "handle expired tokens"]
  },
  "questions": {
    "satisfied": {
      "type": "noul",
      "instructions": "Determine whether the code diff genuinely implements the stated goal. Answer false if the code diff omits required functionality or contains empty stubs.",
      "criteria": {
        "true": "The code diff correctly satisfies and implements the requested goal.",
        "false": "The code diff does not implement the requested goal or only partially implements it."
      }
    }
  }
}
```

### Response Shape
```json
{
  "answers": {
    "satisfied": {
      "type": "noul",
      "noul": 0.9388
    }
  },
  "usage": {
    "prompt_tokens": 420,
    "completion_tokens": 0
  }
}
```

### Calibrated Thresholds ([`decision/tier1.ts`](decision/tier1.ts))
- **`RAW_DONE_THRESHOLD = 0.90`**:
  - `noul >= 0.90`: Goal is satisfied (`phase: 'done'`). Hook returns `{ decision: "allow" }`.
  - `noul < 0.90`: Goal is incomplete (`phase: 'refine'`). Hook returns `{ decision: "continue", reason: "Clef score: 0.XX..." }`.
- **Hysteresis Dead-Band `[0.85, 0.90]`**: A score within this band immediately following an accepted iteration is retained as `done` to prevent oscillation.

---

## 4. Local Runtime Engine: Prebuilt `llama-server`

Median deploys Clef-Flash locally via a dedicated `llama-server` binary:

```bash
# Manage daemon via helper script:
./scripts/clef_daemon.sh start    # Starts daemon on port 8000
./scripts/clef_daemon.sh status   # Queries http://127.0.0.1:8000/health
./scripts/clef_daemon.sh logs     # Follows real-time inference logs
./scripts/clef_daemon.sh stop     # Stops daemon
```

### Auto-Discovery & Zero-Config Fallback
When Median's hook runs, it automatically checks `http://127.0.0.1:8000/health`. If the server is live, decisions route through `/v1/systemone`. If the server is offline or unreachable, Median logs an informational skip and falls back gracefully to Tier 0 mechanical checks without failing or blocking the agent.

---

## 5. Cloudflare Workers AI (Cloud Fallback)

If local GPU acceleration is unavailable, Median can be configured to query Cloudflare Workers AI edge:

```bash
export CLOUDFLARE_ACCOUNT_ID="your_account_id"
export CLOUDFLARE_API_TOKEN="your_workers_ai_token"
export CLEF_MODEL="@cf/cloudflare/clef-flash"
```
