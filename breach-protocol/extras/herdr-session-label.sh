#!/bin/bash
# Optional Claude Code hook for Breach Protocol (SessionStart and UserPromptSubmit).
# Labels the Herdr terminal a Claude Code session runs in with the session's name,
# `hc label <terminal> claude=<name>` (e.g. claude=api-7c), so the agents list can show [api-7c]
# under each session's title. The name comes from ~/.claude/sessions/<pid>.json.
# Quiet and never blocks: outside Herdr, without hc or jq, or before the name exists, it does nothing.
# It relabels only when the name changes (a small cache file per terminal next to this script).
# Works in Git Bash on Windows and in bash on macOS and Linux. Needs jq.

for d in "$HOME/.local/bin" "$HOME/bin" "/opt/homebrew/bin" "/usr/local/bin"; do PATH="$PATH:$d"; done
[ -n "$LOCALAPPDATA" ] && command -v cygpath >/dev/null 2>&1 && PATH="$PATH:$(cygpath -u "$LOCALAPPDATA")/Programs/herdr-core"
export PATH

[ -n "$HC_TERMINAL_ID" ] || exit 0
command -v hc >/dev/null 2>&1 && command -v jq >/dev/null 2>&1 || exit 0

sid=$(jq -r '.session_id // empty' 2>/dev/null)
[ -n "$sid" ] || exit 0

dir="$HOME/.claude/sessions"
pick() { jq -r --arg s "$sid" 'select(.sessionId == $s) | .name // empty' "$1" 2>/dev/null; }
name=""
[ -n "$CLAUDE_PID" ] && [ -f "$dir/$CLAUDE_PID.json" ] && name=$(pick "$dir/$CLAUDE_PID.json")
if [ -z "$name" ]; then
  for f in "$dir"/*.json; do
    [ -f "$f" ] || continue
    name=$(pick "$f")
    [ -n "$name" ] && break
  done
fi
[ -n "$name" ] || exit 0

cache="$(dirname "$0")/.herdr-label-${HC_TERMINAL_ID//\//_}"
[ "$(cat "$cache" 2>/dev/null)" = "$sid $name" ] && exit 0
hc label "$HC_TERMINAL_ID" "claude=$name" >/dev/null 2>&1 && printf '%s' "$sid $name" > "$cache"
exit 0
