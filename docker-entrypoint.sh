#!/bin/sh
# Log the spacehub CLI in from SPACEHUB_TOKEN (print one with `spacehub auth token`),
# give git an identity for sync commits, then start Next.
set -e
# Drop the quotes or whitespace an env file or dashboard may keep around the token.
SPACEHUB_TOKEN=$(printf '%s' "${SPACEHUB_TOKEN:-}" | tr -d '\r\n' | sed -e "s/^[[:space:]\"']*//" -e "s/[[:space:]\"']*\$//")
if [ -n "$SPACEHUB_TOKEN" ]; then
  export SPACEHUB_TOKEN
  if out=$(printf '%s' "$SPACEHUB_TOKEN" | spacehub auth login --with-token ${SPACEHUB_SERVER:+--server "$SPACEHUB_SERVER"} 2>&1); then
    echo "[instants] spacehub: $(spacehub auth status 2>/dev/null | awk '/^builder/ {print $2}')"
  else
    echo "[instants] spacehub login failed, space sync is off: $out" >&2
  fi
else
  unset SPACEHUB_TOKEN
  echo "[instants] SPACEHUB_TOKEN is not set; space sync needs it" >&2
fi
git config --global user.name >/dev/null 2>&1 || git config --global user.name "${GIT_AUTHOR_NAME:-Instants}"
git config --global user.email >/dev/null 2>&1 || git config --global user.email "${GIT_AUTHOR_EMAIL:-instants@localhost}"
exec "$@"
