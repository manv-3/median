#!/usr/bin/env bash
# Runs local llama-server for Cloudflare Clef-Flash / Clef GGUF
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Resolve requested model
REQUESTED="${1:-$CLEF_MODEL_PATH}"

if [ -n "$REQUESTED" ]; then
    if [ -f "$REQUESTED" ]; then
        MODEL_PATH="$REQUESTED"
    elif [ -f "$PROJECT_ROOT/models/$REQUESTED" ]; then
        MODEL_PATH="$PROJECT_ROOT/models/$REQUESTED"
    elif [ -f "$PROJECT_ROOT/models/${REQUESTED}.gguf" ]; then
        MODEL_PATH="$PROJECT_ROOT/models/${REQUESTED}.gguf"
    fi
fi

if [ -z "$MODEL_PATH" ] || [ ! -f "$MODEL_PATH" ]; then
    GGUF_LIST=("$PROJECT_ROOT/models/"*.gguf)
    if [ -f "${GGUF_LIST[0]}" ]; then
        MODEL_PATH="${GGUF_LIST[0]}"
    else
        MODEL_PATH="$PROJECT_ROOT/models/Clef-Flash-Q4_K_M.gguf"
    fi
fi

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
    echo "[!] Model not found at: $MODEL_PATH"
    echo "Starting downloader..."
    node "$SCRIPT_DIR/download-model.mjs"
fi

echo "$(basename "$MODEL_PATH")" > "$PROJECT_ROOT/.clef_active_model"

echo "=========================================================="
echo "Starting Clef-Flash System One decision server"
echo "Engine:              $ENGINE"
echo "Model:               $MODEL_PATH"
echo "Endpoint:            http://127.0.0.1:8000/v1/systemone"
echo "=========================================================="
echo "In another terminal, export:"
echo "  export CLEF_ENDPOINT=\"http://127.0.0.1:8000/v1/systemone\""
echo "=========================================================="

shift $(( $# > 0 ? 1 : 0 )) || true

exec "$LLAMA_SERVER" \
    --model "$MODEL_PATH" \
    --host 127.0.0.1 \
    --port 8000 \
    --threads 4 \
    --ubatch-size 512 \
    --ctx-size 2048 \
    "${GPU_FLAGS[@]}" \
    "$@"
