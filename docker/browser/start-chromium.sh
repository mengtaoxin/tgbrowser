#!/usr/bin/env bash
set -euo pipefail

# Call the binary directly so Debian's /usr/bin/chromium wrapper does not inject
# extra flags. CDP stays on loopback; socat publishes 0.0.0.0:9222.
#
# --no-sandbox is still required in typical Docker/AppArmor setups (no usable
# user-namespace sandbox). Prefer Patchright client patches for stealth.
exec /usr/lib/chromium/chromium \
  --user-data-dir=/data/profile \
  --remote-debugging-port=9223 \
  --remote-allow-origins=* \
  --no-first-run \
  --no-default-browser-check \
  --disable-dev-shm-usage \
  --no-sandbox \
  --disable-blink-features=AutomationControlled \
  --window-size=1920,1080 \
  --window-position=0,0 \
  about:blank
