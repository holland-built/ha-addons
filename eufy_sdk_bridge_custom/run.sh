#!/bin/sh
# Add-on entrypoint: translate Home Assistant add-on options → the env the bridge reads, then hand off.
#
# HA writes the user's options to /data/options.json (not env), so this is the one glue step the thin
# wrapper adds on top of the bridge image. /data is the add-on's persistent volume, so the login token
# survives restarts (eufy allows ONE session per account — re-auth escalates to 2FA).
set -e

OPTS=/data/options.json

export EUFY_EMAIL="$(jq -r '.email // ""' "$OPTS")"
export EUFY_PASSWORD="$(jq -r '.password // ""' "$OPTS")"
export EUFY_COUNTRY="$(jq -r '.country // "GB"' "$OPTS")"
export EUFY_SESSION="/data/.eufy-session.json"
# Reachable through ingress + the hosted go2rtc ports (not just localhost).
export BRIDGE_HOST="0.0.0.0"

# Optional tuning → bridge env. Defaults in config.yaml mirror the bridge's own, so these are a no-op
# unless the user changes them. debug is a bool option; map it to the truthy string the bridge expects.
export EUFY_POLL_MS="$(jq -r '.poll_ms // 600000' "$OPTS")"
export STREAM_IDLE_MS="$(jq -r '.stream_idle_ms // 300000' "$OPTS")"
export RTSP_IDLE_OFF_MS="$(jq -r '.rtsp_idle_off_ms // 300000' "$OPTS")"
# Feature toggle: speculative P2P prewarm on high-intent events (off by default).
[ "$(jq -r '.prewarm // false' "$OPTS")" = "true" ] && export BRIDGE_PREWARM=1
# Per-event log line is on by default in the bridge; only override when the user turns it off.
[ "$(jq -r '.event_log // true' "$OPTS")" = "false" ] && export BRIDGE_EVENT_LOG=0
[ "$(jq -r '.debug // false' "$OPTS")" = "true" ] && export BRIDGE_DEBUG=1
[ "$(jq -r '.debug_p2p // false' "$OPTS")" = "true" ] && export BRIDGE_DEBUG_P2P=1

# Contract with ha-eufy-sdk-bridge: the bridge image provides this launcher, which starts the daemon
# AND go2rtc. Defined here so the wrapper stays a pure options→env shim.
exec /usr/local/bin/eufy-sdk-bridge
