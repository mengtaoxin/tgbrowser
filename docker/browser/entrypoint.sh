#!/usr/bin/env bash
set -euo pipefail

mkdir -p /data/profile
# Stale locks survive volume reuse across container recreates.
rm -f /data/profile/SingletonLock /data/profile/SingletonCookie /data/profile/SingletonSocket
chown -R browser:browser /data/profile

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
