#!/usr/bin/env bash
# Manager script for Clef local decision server daemon
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_ROOT/.clef_server.pid"
LOG_FILE="$PROJECT_ROOT/.clef_server.log"
ACTIVE_MODEL_FILE="$PROJECT_ROOT/.clef_active_model"

case "$1" in
    start)
        if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            echo "[ok] Clef server is already running (PID: $(cat "$PID_FILE"))"
            if [ -f "$ACTIVE_MODEL_FILE" ]; then
                echo "Active Model: $(cat "$ACTIVE_MODEL_FILE")"
            fi
            exit 0
        fi

        CHOSEN_MODEL="$2"

        # If interactive terminal and no model argument supplied, check available models
        if [ -z "$CHOSEN_MODEL" ] && [ -t 0 ]; then
            AVAILABLE=()
            for f in "$PROJECT_ROOT/models/"*.gguf; do
                [ -e "$f" ] && AVAILABLE+=("$(basename "$f")")
            done

            if [ ${#AVAILABLE[@]} -gt 1 ]; then
                echo "Multiple local models found in models/:"
                for i in "${!AVAILABLE[@]}"; do
                    echo "  [$((i+1))] ${AVAILABLE[$i]}"
                done
                read -p "Select model to launch [1-${#AVAILABLE[@]}, default: 1]: " sel
                sel="${sel:-1}"
                idx=$((sel-1))
                if [ $idx -ge 0 ] && [ $idx -lt ${#AVAILABLE[@]} ]; then
                    CHOSEN_MODEL="${AVAILABLE[$idx]}"
                fi
            fi
        fi

        echo "Starting Clef decision server in background..."
        if [ -n "$CHOSEN_MODEL" ]; then
            nohup "$SCRIPT_DIR/start_clef_server.sh" "$CHOSEN_MODEL" < /dev/null > "$LOG_FILE" 2>&1 &
        else
            nohup "$SCRIPT_DIR/start_clef_server.sh" < /dev/null > "$LOG_FILE" 2>&1 &
        fi
        PID=$!
        disown "$PID" 2>/dev/null || true
        echo "$PID" > "$PID_FILE"
        sleep 2
        if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            echo "[ok] Clef server started successfully (PID: $(cat "$PID_FILE"))"
            if [ -f "$ACTIVE_MODEL_FILE" ]; then
                echo "Active Model: $(cat "$ACTIVE_MODEL_FILE")"
            fi
            echo "Logs:         $LOG_FILE"
            echo "Endpoint:     http://127.0.0.1:8000/v1/systemone"
        else
            echo "[error] Failed to start server. Check logs: $LOG_FILE"
            exit 1
        fi
        ;;
    stop)
        if [ -f "$PID_FILE" ]; then
            PID="$(cat "$PID_FILE")"
            echo "Stopping Clef server (PID: $PID)..."
            kill "$PID" 2>/dev/null || true
            rm -f "$PID_FILE"
            rm -f "$ACTIVE_MODEL_FILE"
            echo "[ok] Stopped."
        else
            pkill -f "llama-server.*Clef" 2>/dev/null && echo "[ok] Stopped." || echo "Clef server is not running."
            rm -f "$ACTIVE_MODEL_FILE"
        fi
        ;;
    status)
        HEALTH_RES=$(curl -s http://127.0.0.1:8000/health || true)
        if echo "$HEALTH_RES" | grep -q '"status":"ok"'; then
            echo "[ok] Clef server is active and healthy on http://127.0.0.1:8000/v1/systemone"
            if [ -f "$PID_FILE" ]; then
                echo "PID:          $(cat "$PID_FILE")"
            fi
            if [ -f "$ACTIVE_MODEL_FILE" ]; then
                echo "Active Model: $(cat "$ACTIVE_MODEL_FILE")"
            fi
        elif echo "$HEALTH_RES" | grep -q 'Loading model'; then
            echo "[loading] Clef server is currently loading model weights into memory..."
            if [ -f "$PID_FILE" ]; then
                echo "PID:          $(cat "$PID_FILE")"
            fi
            if [ -f "$ACTIVE_MODEL_FILE" ]; then
                echo "Active Model: $(cat "$ACTIVE_MODEL_FILE")"
            fi
        else
            echo "Clef server is not responding on http://127.0.0.1:8000"
        fi
        ;;
    logs)
        tail -f "$LOG_FILE"
        ;;
    *)
        echo "Usage: $0 {start [model]|stop|status|logs}"
        echo ""
        echo "Examples:"
        echo "  $0 start                       # Starts default/detected model"
        echo "  $0 start Clef-Flash-Q8_0.gguf  # Starts specific model"
        echo "  $0 status                      # Checks server health & active model"
        echo "  $0 logs                        # Follows live decision logs"
        echo "  $0 stop                        # Stops server"
        exit 1
        ;;
esac
