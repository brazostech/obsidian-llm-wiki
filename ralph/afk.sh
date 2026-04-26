#!/bin/bash
set -eo pipefail

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SANDBOX_IMAGE="${RALPH_SANDBOX_IMAGE:-opencode-sandbox}"
OPENCODE_DATA="${RALPH_DATA_DIR:-$PROJECT_ROOT/.ralph-data}"
RALPH_MODEL="${RALPH_MODEL:-opencode/kimi-k2.6}"
WORKTREE_DIR="${RALPH_WORKTREE:-$PROJECT_ROOT/.ralph-worktree}"

if [ -z "$OPENCODE_API_KEY" ]; then
  echo "Error: OPENCODE_API_KEY not set. Export it before running afk.sh"
  exit 1
fi

display='
  if .type == "text" then
    .part.text // "" | gsub("\n"; "\r\n") | . + "\r\n\n"
  elif .type == "step_start" then
    ">> step start\r\n"
  elif .type == "step_finish" then
    ">> step finish (" + (.part.reason // "?") + ")\r\n"
  elif .type == "tool_use" then
    ">> tool: " + (.part.tool // "?") + " -> " + (.part.state.status // "?") +
    (if .part.state.status == "error" then " (" + (.part.state.error[:200] // "") + ")" else "" end) +
    "\r\n"
  elif .type == "error" then
    ">> ERROR: " + (.error.name // "unknown") + ": " + (.error.data.message // "") + "\r\n"
  else
    empty
  end
'

RALPH_BRANCH="ralph/$(date +%Y%m%d-%H%M%S)"

echo "=== Creating worktree at $WORKTREE_DIR on branch $RALPH_BRANCH ==="
git worktree add "$WORKTREE_DIR" -b "$RALPH_BRANCH" 2>/dev/null || {
  echo "Worktree already exists or branch exists. Removing and recreating..."
  git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true
  git branch -D "$RALPH_BRANCH" 2>/dev/null || true
  git worktree add "$WORKTREE_DIR" -b "$RALPH_BRANCH"
}

mkdir -p "$OPENCODE_DATA"

cleanup() {
  echo "=== Merging ralph branch back to $BRANCH ==="
  cd "$PROJECT_ROOT"
  git merge "$RALPH_BRANCH" --no-edit 2>/dev/null && echo "Merged successfully" || {
    echo "Merge conflict. RALPH_BRANCH $RALPH_BRANCH preserved for manual resolution."
    echo "Resolve with: git merge $RALPH_BRANCH"
    exit 1
  }
  git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true
  git branch -d "$RALPH_BRANCH" 2>/dev/null || true
  echo "Worktree cleaned up."
}
trap cleanup EXIT

for ((i=1; i<=$1; i++)); do
  tmpfile=$(mktemp)

  commits=$(git -C "$WORKTREE_DIR" log -n 5 --format="%H%n%ad%n%B---" --date=short 2>/dev/null || echo "No commits found")
  issues=$(cat "$WORKTREE_DIR"/issues/0*.md 2>/dev/null || echo "No issues found")
  prompt=$(cat "$WORKTREE_DIR"/ralph/prompt.md)

  echo "=== Ralph iteration $i/$1 (model: $RALPH_MODEL) ==="

  podman run --rm \
    -e OPENCODE_API_KEY \
    -v "$WORKTREE_DIR":/workspace:Z \
    -v "$OPENCODE_DATA":/root/.local/share/opencode:Z \
    -w /workspace \
    "$SANDBOX_IMAGE" \
    run --format json --dangerously-skip-permissions -m "$RALPH_MODEL" \
    "Previous commits: $commits Issues: $issues $prompt" \
  2>"${tmpfile}.stderr" \
  | grep --line-buffered '^{' \
  | tee "$tmpfile" \
  | jq --unbuffered -rj "$display"

  if [ -s "${tmpfile}.stderr" ]; then
    echo "--- stderr ---"
    cat "${tmpfile}.stderr"
    echo "--- end stderr ---"
  fi

  result=$(jq -s -r '[.[] | select(.type == "text").part.text // empty] | join("")' "$tmpfile")

  rm -f "$tmpfile" "${tmpfile}.stderr"

  if [[ "$result" == *"<promise>NO MORE TASKS</promise>"* ]]; then
    echo "Ralph complete after $i iterations."
    exit 0
  fi
done
