# addons_src — local add-on sources

Home Assistant looks for local add-ons in `/addons`, which is **not** part of this
repo and is not reachable from the Claude session. So the sources live here, under
version control, and get copied across.

## Install / update a local add-on

From the **Advanced SSH & Web Terminal** add-on (or any host shell):

```sh
mkdir -p /addons
cp -r /config/addons_src/<name> /addons/
ha addons reload
```

Then **Settings → Add-ons → Add-on Store → Local apps**, install, fill options, start.

After editing anything here, repeat the copy and hit **Rebuild** on the add-on.

---

## eufy_sdk_bridge_custom

Local build of `mega-yfue/ha-eufy-sdk-addon`'s `eufy_sdk_bridge`, patched so the
HomeBase 3 **custom arming modes** can be written.

**The problem.** The bridge's bundled SDK allows only three arming modes:

```js
var ArmingMode = { away: "away", home: "home", disarmed: "disarmed" };
```

`device.set armingMode=3` is rejected — `mode: 3 is not a valid value (must be one
of 0/1/63)` — even though `ARMING_MODE_WIRE` already maps `custom1/2/3` to `3/4/5`
and `armingCommand()` merely puts the wire value into cmd 1224. Nothing downstream
is mode-specific.

This broke `automation.security_arm_cameras`, which sets Custom 1 at sunset — a
"don't alert" posture that `home`/`away` cannot reproduce.

**The patch.** Three keys added to that object, applied by one `sed` in the
Dockerfile, with a `grep -q` guard that fails the build if the bundle shape ever
changes (so an upstream bump can't silently un-patch it).

**Differences from upstream:** `slug` → `eufy_sdk_bridge_custom`, `name`/`description`
changed, `image:` removed (forces a local build), plus the sed+guard. Ports, ingress,
options and schema are byte-identical, so options copy over 1:1.

### Cut-over

Only one bridge can run: they share host ports 3000/1984/8554/8555, and eufy allows
one session per account.

1. Copy the options out of the published add-on (email / password / country / the
   five tuning values).
2. **Stop** `eufy-sdk bridge` (`b0e7d1ed_eufy_sdk_bridge`) and set its boot to manual.
3. Install this one from **Local apps**, paste the options, start.
4. Expect one re-login, possibly a 2FA prompt — the session file lives in the old
   add-on's `/data` and does not carry over.
5. Point the `eufy_sdk` integration at the new host if it uses the add-on hostname
   (`b0e7d1ed-eufy-sdk-bridge:3000`); no change needed if it uses `homeassistant:3000`.
6. Verify: `select.ditto_arming_mode` should now accept `custom1`. Watch for
   `StateConvergenceError` — that means the HomeBase itself refused, which would be
   a different problem from the allowlist.

### Upgrading

Bump the tag in `build.yaml` (`ghcr.io/mega-yfue/ha-eufy-sdk-bridge:<version>`) and
rebuild. If the build fails at the `grep -q`, the bundle changed — re-derive the sed
anchor before shipping.

Retire this add-on entirely once the fix lands upstream in `mega-yfue/eufy-sdk`
(`src/model/capabilities/arming.ts`) and a new bridge image carries it.
