#!/bin/sh
# Read-only check that one verify instance is ours and has loaded the app. Exit 0 only if all pass.
set -u
REPO=$(git rev-parse --show-toplevel)
NAME=${INKLING_VERIFY_NAME:-default}
PORT=${INKLING_VERIFY_PORT:-9333}
RUN="$HOME/.capy/work/verify-inkling-run/$NAME"
PID=$(cat "$RUN/electron.pid" 2>/dev/null || echo none)
fail=0
check() {
  if sh -c "$2" >/dev/null 2>&1; then echo "PASS $1"; else echo "FAIL $1"; fail=1; fi
}
check "pidfile present" "test '$PID' != none"
check "electron pid alive" "kill -0 $PID"
check "pid runs our scratch data dir" "tr '\\0' ' ' < /proc/$PID/cmdline | grep -F -- '--user-data-dir=$RUN/library'"
check "CDP port owned by our pid" "ss -H -ltnp 'sport = :$PORT' | grep -F 'pid=$PID,'"
check "app page loaded over CDP" "curl -fs http://127.0.0.1:$PORT/json/list | grep -F 'app://local/index.html'"
check "library database exists" "test -f '$RUN/library/library.sqlite3'"
check "renderer build present" "test -f '$REPO/dist/index.html'"
exit $fail
