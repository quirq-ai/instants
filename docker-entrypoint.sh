#!/bin/sh
# Log the spacehub CLI in from SPACEHUB_TOKEN (print one with `spacehub auth token`),
# give git an identity for sync commits, then start Next.
set -e
if [ -n "$SPACEHUB_TOKEN" ]; then
  printf '%s' "$SPACEHUB_TOKEN" | spacehub auth login --with-token ${SPACEHUB_SERVER:+--server "$SPACEHUB_SERVER"} >/dev/null \
    && echo "[instants] spacehub: $(spacehub auth status 2>/dev/null | awk '/^builder/ {print $2}')" \
    || echo "[instants] spacehub login failed; space sync is off" >&2
fi
git config --global user.name >/dev/null 2>&1 || git config --global user.name "${GIT_AUTHOR_NAME:-Instants}"
git config --global user.email >/dev/null 2>&1 || git config --global user.email "${GIT_AUTHOR_EMAIL:-instants@localhost}"
exec "$@"
