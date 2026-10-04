# Model Context: Cloudflare Clef

Everything about the decision model behind Tier 1: what it is, how this project uses it, its advantages over Laya, and API specifications.

---

## 1. What Clef Is

- An open-weight decision model family released by Cloudflare on October 1, 2026, hosted on **Cloudflare Workers AI**.
- Unlike traditional text-generating LLMs, Clef is a **System-1 decision model**: it takes a structured state input and a set of predefined typed questions (`noul`, `choice`, `score`), returning calibrated probabilities.
- Available model variants:
  - `@cf/cloudflare/clef-flash` (9B parameters): Optimized for ultra-low latency (<40ms), ideal for agentic decision loops. **(Default)**
  - `@cf/cloudflare/clef` (27B parameters): Prioritized for maximum accuracy on nuanced semantic decisions.
- Massive context window: **65,536 tokens** (compared to Laya's 512 tokens). Full code diffs, prompts, and requirements fit comfortably without aggressive truncation.

**History**: Median originally used Jev (TypeSafe AI), then switched briefly to Laya (Convai Innovations). The project has now moved to Cloudflare Clef for vastly superior context capacity (64k vs 512 tokens), sub-40ms latency, and zero native ONNX binary download dependencies.

---

## 2. Role in Median (Tier 1 Semantic Judge)

Clef powers **Tier 1** only:
- Tier 0 (deterministic TypeScript rules) handles mechanical checks (builds, tests, linter, TypeScript compiler).
- Clef is invoked **only when Tier 0 flags `ambiguous: true`**: tests and builds are green, but confirmation is needed that the code diff genuinely satisfies the user's goal rather than being an empty stub or no-op.

---

## 3. The `noul` Primitive

Clef evaluates a single `noul` question:
- **Input**:
  - `goal`: User prompt / task requirement.
  - `diff`: Git diff or modified workspace code.
  - `verifiedRequirements`: Known requirements or test specifications.
- **Question**:
  ```json
  {
    "satisfied": {
      "type": "noul",
      "instructions": "Determine whether the code diff genuinely implements the stated goal. Answer false if the goal describes behavior that the diff does not actually implement or if it is merely an empty stub.",
      "criteria": {
        "true": "The code diff correctly satisfies and implements the requested goal.",
        "false": "The code diff does not implement the requested goal or only partially implements it."
      }
    }
  }
  ```
- **Output**: Returns a calibrated probability (`noul` between 0 and 1) that the goal is genuinely satisfied.
  - If `noul > 0.90`: Decision is `done`.
  - If `noul <= 0.90`: Decision is `refine` with a targeted fix instruction.

---

## 4. Deployment Modes: Local Hugging Face vs Cloudflare Workers AI

Median supports **both** local open-source inference and hosted Cloudflare Workers AI:

### Option A: Local Hugging Face Model (100% Offline & Free)
The model weights are available directly on Hugging Face:
- `Cloudflare/clef-flash` (9B parameters, Apache-2.0)
- `Cloudflare/clef` (27B parameters, Apache-2.0)

You can run the included local server:
```bash
# 1. Install dependencies
pip install torch transformers fastapi uvicorn accelerate

# 2. Start the local Clef server
python scripts/clef_local_server.py --model Cloudflare/clef-flash --port 8000
```

Then configure Median to use your local server (no API keys required):
```bash
export CLEF_ENDPOINT="http://localhost:8000/run"
```

---

### Option B: Cloudflare Workers AI (Serverless Edge)
If you don't want to run a 9B model locally on your GPU, you can invoke Cloudflare's hosted endpoint:

```bash
export CLOUDFLARE_ACCOUNT_ID="your_account_id"
export CLOUDFLARE_API_TOKEN="your_workers_ai_token"
export CLEF_MODEL="@cf/cloudflare/clef-flash" # or "@cf/cloudflare/clef"
```

If neither is configured, Median gracefully defaults to Tier 0 mechanical checks and allows completion without crashing.

