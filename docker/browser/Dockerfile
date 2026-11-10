FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    LANG=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-cjk \
    novnc \
    openbox \
    socat \
    supervisor \
    websockify \
    x11vnc \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 -s /bin/bash browser \
    && mkdir -p /data/profile /var/log/supervisor \
    && chown -R browser:browser /data

COPY supervisord.conf /etc/supervisor/supervisord.conf
COPY start-chromium.sh /usr/local/bin/start-chromium.sh
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/start-chromium.sh

EXPOSE 9222 6080

VOLUME ["/data/profile"]

ENTRYPOINT ["/entrypoint.sh"]
