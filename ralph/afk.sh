#!/bin/bash
set -eo pipefail

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
SANDBOX_IMAGE="${RALPH_SANDBOX_IMAGE:-opencode-sandbox}"
OPENCODE_DATA="${RALPH_DATA_DIR:-$PROJECT_ROOT/.ralph-data}"
RALPH_MODEL="${RALPH_MODEL:-opencode/kimi-k2.6}"

if [ -z "$OPENCODE_API_KEY" ]; then
  echo "Error: OPENCODE_API_KEY not set. Export it before running afk.sh"
  exit 1
fi

stream_text='select(.type == "text").part.text // empty | gsub("\n"; "\r\n") | . + "\r\n\n"'
step_text='select(.type == "step_start" or .type == "step_finish").type // empty | . + "\r\n"'
tool_text='select(.type == "tool_use").part.tool // empty | "tool: " + . + "\r\n"'
error_text='select(.type == "error").error // empty | "ERROR: " + (.name // "unknown") + ": " + (.data.message // "") + "\r\n"'

for ((i=1; i<=$1; i++)); do
  tmpfile=$(mktemp)

  commits=$(git log -n 5 --format="%H%n%ad%n%B---" --date=short 2>/dev/null || echo "No commits found")
  issues=$(cat issues/*.md 2>/dev/null || echo "No issues found")
  prompt=$(cat ralph/prompt.md)

  mkdir -p "$OPENCODE_DATA"

  echo "=== Ralph iteration $i/$1 (model: $RALPH_MODEL) ==="

  podman run --rm \
    -e OPENCODE_API_KEY \
    -v "$PROJECT_ROOT":/workspace:Z \
    -v "$OPENCODE_DATA":/root/.local/share/opencode:Z \
    -w /workspace \
    "$SANDBOX_IMAGE" \
    run --format json --dangerously-skip-permissions -m "$RALPH_MODEL" \
    "Previous commits: $commits Issues: $issues $prompt" \
  2>"${tmpfile}.stderr" \
  | grep --line-buffered '^{' \
  | tee "$tmpfile" \
  | jq --unbuffered -rj "$step_text, $tool_text, $error_text, $stream_text"

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
