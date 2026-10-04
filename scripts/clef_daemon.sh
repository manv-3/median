#!/usr/bin/env bash
# Manager script for Clef local decision server daemon
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_ROOT/.clef_server.pid"
LOG_FILE="$PROJECT_ROOT/.clef_server.log"

case "$1" in
    start)
        if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            echo "[ok] Clef server is already running (PID: $(cat "$PID_FILE"))"
            exit 0
        fi
        echo "Starting Clef decision server in background..."
        nohup "$SCRIPT_DIR/start_clef_server.sh" > "$LOG_FILE" 2>&1 &
        echo $! > "$PID_FILE"
        sleep 2
        if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            echo "[ok] Clef server started successfully (PID: $(cat "$PID_FILE"))"
            echo "Logs: $LOG_FILE"
            echo "Endpoint: http://127.0.0.1:8000/v1/systemone"
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
            echo "[ok] Stopped."
        else
            # Try to kill any running llama-server
            pkill -f "llama-server.*Clef-Flash" 2>/dev/null && echo "[ok] Stopped." || echo "Clef server is not running."
        fi
        ;;
    status)
        if curl -s http://127.0.0.1:8000/health | grep -q "ok"; then
            echo "[ok] Clef server is active and healthy on http://127.0.0.1:8000/v1/systemone"
            if [ -f "$PID_FILE" ]; then
                echo "PID: $(cat "$PID_FILE")"
            fi
        else
            echo "Clef server is not responding on http://127.0.0.1:8000"
        fi
        ;;
    logs)
        tail -f "$LOG_FILE"
        ;;
    *)
        echo "Usage: $0 {start|stop|status|logs}"
        exit 1
        ;;
esac
