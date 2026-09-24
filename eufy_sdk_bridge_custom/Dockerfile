# Local build of the eufy-sdk bridge add-on on top of the published bridge image.
#
# 0.3.0-push6 (2026-09-23): rebased on bridge 0.3.0 / eufy-sdk 0.2.0. Two earlier patches are gone
# because upstream now ships them: the HomeBase custom1/2/3 arming modes, and openudid + a persisted
# FCM token (upstream PR #37, from our issue #30). run.sh still sets our own openudid, now under the
# name the 0.3.0 bridge reads (BRIDGE_OPENUDID). The guards below fail the build if upstream ever
# drops either, instead of shipping a bridge that silently lost them.
#
# Kept: the push-channel repairs and the HomeBase frame diagnostic (patch-push.mjs), plus patch 7
# there, which keeps the old channel behaviour for two same-model cameras on one HomeBase until we
# have read their channel numbers from the boot log.
ARG BUILD_FROM=ghcr.io/mega-yfue/ha-eufy-sdk-bridge:0.3.0
FROM ${BUILD_FROM}

# The bridge base is node:alpine (no s6/bashio). `jq` lets the run script read /data/options.json.
RUN apk add --no-cache jq

ARG SDK_BUNDLE=/app/node_modules/@mega-yfue/eufy-sdk/dist/index.js

# Guards: upstream must still carry what we dropped.
RUN grep -q 'custom3: "custom3"' "${SDK_BUNDLE}" \
    && grep -q 'FileFcmStore(cfg.pushSession)' /app/src/client.mjs \
    && grep -q 'BRIDGE_OPENUDID' /app/src/config.mjs \
    && echo "upstream arming modes + push identity present"

# Third patch: repair the push channel so detections keep arriving (see patch-push.mjs header).
# Every replacement must match exactly once or the script exits 1 and fails the build.
COPY patch-push.mjs /tmp/patch-push.mjs
RUN node /tmp/patch-push.mjs "${SDK_BUNDLE}" \
    && grep -q 'push-fix' "${SDK_BUNDLE}" \
    && rm /tmp/patch-push.mjs

# Upstream bug (bridge 0.3.0 boot.mjs): writeGo2rtcConfig returns serial strings, but the camera
# channel-map diagnostic reads `.sn` from each, so the map never prints. Accept both shapes.
RUN sed -i 's#const camSns = new Set(cams.map((c) => c.sn));#const camSns = new Set(cams.map((c) => c?.sn ?? c));#' /app/src/boot.mjs \
    && grep -q 'c?.sn ?? c' /app/src/boot.mjs \
    && echo "channel-map log fix applied"

COPY run.sh /run.sh
RUN chmod +x /run.sh

LABEL \
    org.opencontainers.image.title="Home Assistant Add-on: eufy-sdk bridge (custom-modes patch)" \
    org.opencontainers.image.description="eufy-sdk bridge with HomeBase custom arming modes enabled." \
    org.opencontainers.image.source="https://github.com/mega-yfue/ha-eufy-sdk-addon" \
    org.opencontainers.image.licenses="MIT"

CMD [ "/run.sh" ]
