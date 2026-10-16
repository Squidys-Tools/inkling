#!/bin/sh
# Stop the Electron pid this run recorded, then delete its scratch library. Evidence in
# .artifacts/verify-inkling/ is never touched. Never matches processes by name.
set -u
REPO=$(git rev-parse --show-toplevel)
NAME=${INKLING_VERIFY_NAME:-default}
RUN="$HOME/.capy/work/verify-inkling-run/$NAME"
PID=$(cat "$RUN/electron.pid" 2>/dev/null || echo none)
if [ "$PID" != none ] && kill -0 "$PID" 2>/dev/null \
  && tr '\0' ' ' < "/proc/$PID/cmdline" | grep -qF -- "--user-data-dir=$RUN/library"; then
  kill -TERM "$PID"
  for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
  kill -0 "$PID" 2>/dev/null && kill -KILL "$PID"
  echo "stopped electron pid $PID"
else
  echo "no live electron owned by this run"
fi
rm -rf "$RUN/library" "$RUN/electron.pid"
echo "removed $RUN/library"
