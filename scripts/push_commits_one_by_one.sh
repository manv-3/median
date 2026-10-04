#!/usr/bin/env bash
# Sequentially pushes unpushed commits to origin/Main one by one
set -e

# Gather all unpushed commits in chronological order
COMMITS=($(git rev-list --reverse origin/Main..HEAD))
TOTAL=${#COMMITS[@]}

if [ "$TOTAL" -eq 0 ]; then
    echo "No unpushed commits. Everything is up to date."
    exit 0
fi

echo "=========================================================="
echo "Found $TOTAL commits to push to origin/Main one by one"
echo "=========================================================="

# Enable credential caching in git for 15 minutes so you only authenticate once
git config credential.helper "cache --timeout=900"

COUNT=1
for COMMIT in "${COMMITS[@]}"; do
    SHORT=$(git rev-parse --short "$COMMIT")
    MSG=$(git log -1 --pretty=format:"%s" "$COMMIT")
    echo ""
    echo "[$COUNT/$TOTAL] Pushing commit $SHORT: $MSG..."
    git push origin "$COMMIT:refs/heads/Main"
    echo "[ok] Successfully pushed $SHORT"
    COUNT=$((COUNT + 1))
    sleep 1
done

echo ""
echo "=========================================================="
echo "[ok] All $TOTAL commits pushed to origin/Main successfully!"
echo "=========================================================="
