#!/bin/sh
# Launch the built inkling app against a scratch data dir. Blocks until the app exits,
# so start it with execution: detached. Needs `bun run build:app` to have produced dist/.
set -eu
REPO=$(git rev-parse --show-toplevel)
NAME=${INKLING_VERIFY_NAME:-default}
PORT=${INKLING_VERIFY_PORT:-9333}
RUN="$HOME/.capy/work/verify-inkling-run/$NAME"
test -f "$REPO/dist/index.html" || { echo "dist/ missing: run bun run build:app first" >&2; exit 1; }
mkdir -p "$RUN"
cd "$REPO"
exec xvfb-run -a sh -c "echo \$\$ > '$RUN/electron.pid'; exec ./node_modules/electron/dist/electron . --no-sandbox --remote-debugging-port=$PORT --user-data-dir='$RUN/library' > '$RUN/electron.log' 2>&1"
