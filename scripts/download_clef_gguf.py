#!/usr/bin/env python3
"""
Downloads Cloudflare Clef-Flash GGUF (official ggml-org decision model) from Hugging Face.
Supports resume and high-speed transfer.
"""
import os
import sys
from pathlib import Path

REPO_ID = "ggml-org/Clef-Flash-GGUF"
FILENAME = "Clef-Flash-Q4_K_M.gguf"
MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


def main():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    target_file = MODELS_DIR / FILENAME

    if target_file.exists() and target_file.stat().st_size > 6_000_000_000:
        print(f"[ok] Clef-Flash GGUF is already downloaded at: {target_file}")
        print(f"File size: {target_file.stat().st_size / 1e9:.2f} GB")
        return

    print("=" * 65)
    print("Downloading Official Cloudflare Clef-Flash GGUF (~6.48 GB)")
    print(f"Repository:  {REPO_ID}")
    print(f"File:        {FILENAME}")
    print(f"Target:      {target_file}")
    print("=" * 65)
    print("Download will run in background and can be resumed if interrupted.\n")

    os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
    from huggingface_hub import hf_hub_download

    try:
        downloaded_path = hf_hub_download(
            repo_id=REPO_ID,
            filename=FILENAME,
            local_dir=str(MODELS_DIR)
        )
        print(f"\n[ok] Successfully downloaded model to: {downloaded_path}")
        print(f"File size: {os.path.getsize(downloaded_path) / 1e9:.2f} GB")
    except Exception as e:
        print(f"\n[error] Download failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
