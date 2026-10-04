#!/usr/bin/env bash
# Runs local llama-server for Cloudflare Clef-Flash GGUF
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

MODEL_PATH="$PROJECT_ROOT/models/Clef-Flash-Q4_K_M.gguf"

# Determine server binary (prefer CUDA build if available)
if [ -x "$PROJECT_ROOT/.llama-bin/llama-cuda/llama-server" ]; then
    LLAMA_SERVER="$PROJECT_ROOT/.llama-bin/llama-cuda/llama-server"
    BIN_DIR="$PROJECT_ROOT/.llama-bin/llama-cuda"
    GPU_FLAGS=("-ngl" "99")
    ENGINE="CUDA GPU (NVIDIA RTX 3050)"
else
    LLAMA_SERVER="$PROJECT_ROOT/.llama-bin/llama-b11396/llama-server"
    BIN_DIR="$PROJECT_ROOT/.llama-bin/llama-b11396"
    GPU_FLAGS=()
    ENGINE="Multi-threaded CPU"
fi

# Ensure library paths are loaded (NixOS + CUDA)
export LD_LIBRARY_PATH="$BIN_DIR:/run/opengl-driver/lib:/run/current-system/sw/share/nix-ld/lib:$LD_LIBRARY_PATH"

if [ ! -f "$MODEL_PATH" ]; then
    RUNNING_PID=$(pgrep -f "download_clef_gguf.py" | grep -v "$$" | head -n 1 || true)
    if [ -n "$RUNNING_PID" ]; then
        echo "[!] Download is already running in background (PID $RUNNING_PID)."
        echo "Please wait for the model download to finish before starting the server."
        echo "You can check progress with:"
        echo "  ls -lh $PROJECT_ROOT/models/.cache/huggingface/download/"
        exit 0
    fi
    echo "[!] Model not found at: $MODEL_PATH"
    echo "Starting download..."
    "$SCRIPT_DIR/download_clef_gguf.sh"
fi

echo "=========================================================="
echo "Starting Clef-Flash System One decision server"
echo "Engine:              $ENGINE"
echo "Model:               $MODEL_PATH"
echo "Endpoint:            http://127.0.0.1:8000/v1/systemone"
echo "=========================================================="
echo "In another terminal, export:"
echo "  export CLEF_ENDPOINT=\"http://127.0.0.1:8000/v1/systemone\""
echo "=========================================================="

exec "$LLAMA_SERVER" \
    --model "$MODEL_PATH" \
    --host 127.0.0.1 \
    --port 8000 \
    --threads "$(nproc)" \
    --ubatch-size 2048 \
    --ctx-size 4096 \
    "${GPU_FLAGS[@]}" \
    "$@"
