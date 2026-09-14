# Local build of the eufy-sdk bridge add-on, patched to allow writing the
# HomeBase 3 custom arming modes (custom1/custom2/custom3 = wire 3/4/5).
#
# WHY THIS EXISTS
# The bridge's bundled SDK gates armingMode writes on a three-key allowlist:
#
#   var ArmingMode = { away: "away", home: "home", disarmed: "disarmed" };
#
# `SETTABLE_MODES` derives from it, so `device.set armingMode=3` is rejected with
#   mode: 3 is not a valid value (must be one of 0/1/63)
# even though ARMING_MODE_WIRE already maps custom1/2/3 -> 3/4/5 and
# armingCommand() just drops the wire value into cmd 1224. Nothing downstream is
# mode-specific, so widening the allowlist is the entire fix. The post-write
# convergence check (20s, StateConvergenceError) still guards us: a mode the
# HomeBase actually refuses surfaces as an error, not a silent success.
#
# Upstream: https://github.com/mega-yfue/eufy-sdk src/model/capabilities/arming.ts
# Remove this add-on once that ships and the published image carries the fix.
ARG BUILD_FROM=ghcr.io/mega-yfue/ha-eufy-sdk-bridge:0.2.0
FROM ${BUILD_FROM}

# The bridge base is node:alpine (no s6/bashio). `jq` lets the run script read /data/options.json.
RUN apk add --no-cache jq

# The patch. `disarmed: "disarmed"` without a trailing comma occurs exactly once
# in the bundle (ARMING_MODE_WIRE uses `disarmed: 63`), so the anchor is unique.
# The grep afterwards is the guard: if a future base image changes the bundle
# shape the sed silently no-ops, and this FAILS THE BUILD rather than shipping an
# unpatched add-on that looks patched.
ARG SDK_BUNDLE=/app/node_modules/@mega-yfue/eufy-sdk/dist/index.js
RUN sed -i 's/^  disarmed: "disarmed"$/  disarmed: "disarmed",\n  custom1: "custom1",\n  custom2: "custom2",\n  custom3: "custom3"/' "${SDK_BUNDLE}" \
    && grep -q 'custom3: "custom3"' "${SDK_BUNDLE}" \
    && echo "arming patch applied to ${SDK_BUNDLE}"

# Second patch: give this container its OWN push identity and persist the FCM token.
#
# `createEufy()` passes neither `openudid` nor `pushStore`, so the SDK (a) derives the
# device identity from the account email — identical for every client on the account,
# which its own CONTENDED_SESSION_HINT warns against — and (b) falls back to
# `MemoryFcmStore`, so the FCM token and seen-ids are thrown away on every boot and a
# brand-new token is registered each start.
#
# Symptom this addresses: this container received `doorbellPress` and
# `armingModeChanged` pushes but never `personDetected`/`motion`, while the published
# add-on on the same account received them fine.
#
# The `grep -q` calls fail the build if either anchor stops matching.
RUN sed -i \
    -e 's#^import { EufyMega, FileSessionStore, ConsoleLogger } from "@mega-yfue/eufy-sdk";#import { EufyMega, FileSessionStore, FileFcmStore, ConsoleLogger } from "@mega-yfue/eufy-sdk";#' \
    -e 's#^    store: new FileSessionStore(cfg.session),#    store: new FileSessionStore(cfg.session),\n    openudid: process.env.EUFY_OPENUDID || undefined,\n    pushStore: new FileFcmStore(cfg.session.replace(/[^/]*$/, ".eufy-fcm.json")),#' \
    /app/src/client.mjs \
    && grep -q 'EUFY_OPENUDID' /app/src/client.mjs \
    && grep -q 'FileFcmStore(' /app/src/client.mjs \
    && echo "push-identity patch applied to /app/src/client.mjs"

# Third patch: repair the push channel so detections keep arriving (see patch-push.mjs header).
# Every replacement must match exactly once or the script exits 1 and fails the build.
COPY patch-push.mjs /tmp/patch-push.mjs
RUN node /tmp/patch-push.mjs "${SDK_BUNDLE}" \
    && grep -q 'push-fix' "${SDK_BUNDLE}" \
    && rm /tmp/patch-push.mjs

COPY run.sh /run.sh
RUN chmod +x /run.sh

LABEL \
    org.opencontainers.image.title="Home Assistant Add-on: eufy-sdk bridge (custom-modes patch)" \
    org.opencontainers.image.description="eufy-sdk bridge with HomeBase custom arming modes enabled." \
    org.opencontainers.image.source="https://github.com/mega-yfue/ha-eufy-sdk-addon" \
    org.opencontainers.image.licenses="MIT"

CMD [ "/run.sh" ]
