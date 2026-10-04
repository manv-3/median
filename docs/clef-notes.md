# Cloudflare Clef-Flash Notes

## 1. Model Overview

- **Model ID:** `Cloudflare/clef-flash` (Hugging Face) / `@cf/cloudflare/clef-flash` (Cloudflare Workers AI)
- **Base Architecture:** Qwen3.5-9B decision-tuned model
- **License:** Apache 2.0 (open weights)
- **Context Window:** 65,536 tokens (compared to Laya's 512 tokens)
- **Target Latency:** ~38ms median inference time
- **Output:** Calibrated decision probabilities (`noul`, `choice`, `score`)

---

## 2. Hardware & VRAM Footprint

Because Clef is a **prefill-only decision model** (it scores schema options in a single pass without token-by-token text generation), it does not suffer from KV-cache expansion.

| Mode | Precision | VRAM Needed | Compatibility |
| :--- | :--- | :--- | :--- |
| **4-Bit Quantized** | `NF4` / `BitsAndBytes` | **~5.1 - 5.4 GB** | **Fits RTX 3050 6GB, RTX 3060/4060 laptop GPUs** |
| **8-Bit Quantized** | `INT8` | ~9.5 - 10.5 GB | Fits 12GB GPUs (RTX 3060 12GB, RTX 4070) |
| **Full Precision** | `FP16` / `BF16` | ~18 - 20 GB | Requires 24GB GPUs (RTX 3090 / 4090) |

---

## 3. Running Locally on a 6GB GPU (e.g. RTX 3050)

Median includes a local inference server ready for low-VRAM deployment:

```bash
# 1. Install prerequisites
pip install torch transformers fastapi uvicorn accelerate bitsandbytes

# 2. Launch in 4-bit mode (allocates ~5.2 GB VRAM)
python scripts/clef_local_server.py --model Cloudflare/clef-flash --load-4bit --port 8000

# 3. Export endpoint for Median
export CLEF_ENDPOINT="http://localhost:8000/run"
```

---

## 4. API Request & Response Shapes

### Request
```json
{
  "state": {
    "goal": "Implement binary search tree with tests",
    "diff": "diff --git a/bst.ts b/bst.ts ...",
    "verifiedRequirements": ["insert", "search", "delete"]
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

### Response
```json
{
  "answers": {
    "satisfied": {
      "type": "noul",
      "noul": 0.96
    }
  },
  "model": "Cloudflare/clef-flash"
}
```

---

## 5. Integration in Median

- **Tier 0**: Runs deterministic checks (build, test, lint, type errors) in < 1ms.
- **Tier 1 (`decision/tier1.ts`)**: Invoked only when Tier 0 flags `ambiguous: true`. Checks Clef's `noul` score against `RAW_DONE_THRESHOLD = 0.90`.
- **Fail-Safe**: If neither local `CLEF_ENDPOINT` nor Cloudflare Workers AI credentials are set, Median notes the skip in decision reasons and falls back gracefully to Tier 0 mechanical checks without crashing.
