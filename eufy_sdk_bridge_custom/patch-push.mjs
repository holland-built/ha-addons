// Push-channel repair for the eufy-sdk bundle (SDK 0.2.0 in ha-eufy-sdk-bridge 0.3.0; first written for 0.1.0).
//
// Symptom: pushConnected=true, the phone app gets every detection, but person/motion/doorbell pushes
// stop reaching the bridge. Evidence on this box (2026-09-14): two ESTABLISHED sockets to
// mtalk.google.com:5228 with the same FCM credentials, "register_push_token failed" in the log, and a
// fresh token that received nothing after restart.
//
// Fixes, each an exact-text replacement that must match exactly once (the build fails otherwise):
//  1. Close a push channel whose realtime start was superseded. A start that hangs in warmWiredP2P keeps
//     its connected push client forever; the next start logs in a second client with the same androidId,
//     and Google delivers to only one of them.
//  2. Detect a dead push socket: no reply within 30 s of a heartbeat ping -> destroy -> normal reconnect.
//  3. Re-register the push token with eufy on every push (re)connect, and log the result.
//  4. Clear the seen-ids list after a successful login (the server has acked them), as
//     eufy-security-client does, so it stops growing forever.
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
let src = readFileSync(file, "utf8");

function replaceOnce(name, oldText, newText) {
  const count = src.split(oldText).length - 1;
  if (count !== 1) {
    console.error(`[patch-push] ${name}: anchor matched ${count} times, expected 1`);
    process.exit(1);
  }
  src = src.replace(oldText, newText);
  console.log(`[patch-push] ${name}: applied`);
}

replaceOnce(
  "close superseded push channel",
  `      const pushStart = this.startPush(generation.abort.signal).then((client) => {
        push = client;
`,
  `      const pushStart = this.startPush(generation.abort.signal).then((client) => {
        push = client;
        const closeOrphan = () => {
          if (this.pushClient !== client) {
            client.close();
            console.error("[push-fix] closed a push channel left over from a superseded realtime start");
          }
        };
        if (generation.abort.signal.aborted || epoch !== this.realtimeEpoch)
          closeOrphan();
        else
          generation.abort.signal.addEventListener("abort", closeOrphan, { once: true });
`,
);

replaceOnce(
  "any inbound message proves the socket is alive",
  `  onMessage(m) {
    switch (m.tag) {
      case MessageTag.LoginResponse:`,
  `  onMessage(m) {
    this.clearAckTimer();
    switch (m.tag) {
      case MessageTag.LoginResponse:`,
);

replaceOnce(
  "clear seen ids after login",
  `          this.loginFailures = 0;
          this.startHeartbeat();
          this.logger.debug("[push] logged in");`,
  `          this.loginFailures = 0;
          this.persistentIds = [];
          this.startHeartbeat();
          console.log("[push-fix] push channel logged in");`,
);

replaceOnce(
  "heartbeat reply watchdog",
  `      if (this.socket && this.loggedIn)
        this.socket.write(this.buildHeartbeatPing());
    }, HEARTBEAT_MS2);
  }
  stopHeartbeat() {
    if (this.heartbeatTimer)`,
  `      if (this.socket && this.loggedIn) {
        this.socket.write(this.buildHeartbeatPing());
        this.clearAckTimer();
        this.ackTimer = setTimeout(() => {
          console.error("[push-fix] no reply to push heartbeat in 30s - reconnecting the push channel");
          this.socket?.destroy();
        }, 3e4);
      }
    }, HEARTBEAT_MS2);
  }
  clearAckTimer() {
    if (this.ackTimer)
      clearTimeout(this.ackTimer);
    this.ackTimer = void 0;
  }
  stopHeartbeat() {
    this.clearAckTimer();
    if (this.heartbeatTimer)`,
);

replaceOnce(
  "re-register push token on every connect",
  `    client.on("connect", () => this.emit("pushConnect"));`,
  `    client.on("connect", () => {
      this.emit("pushConnect");
      this.mega.registerPushToken(persistedCreds.fcmToken).then(
        () => console.log("[push-fix] push token registered with eufy"),
        (e) => console.error(\`[push-fix] push token registration failed: \${e?.message ?? e}\`),
      );
    });`,
);

// 6. Diagnostic (only with add-on option debug_p2p): log every non-media frame the HomeBase sends
//    over the local connection, so a detection can be matched to what the station announces locally.
replaceOnce(
  "log HomeBase frames when debug_p2p is on",
  `    const text2 = readNullTerminatedString(data);
`,
  `    const text2 = readNullTerminatedString(data);
    if (!isMedia && process.env.BRIDGE_DEBUG_P2P)
      console.log(\`[p2p-frame] \${new Date().toISOString()} station=\${this.cfg.stationSn} ch=\${header.channel} cmd=\${header.commandId} \${commandName(header.commandId)} len=\${data.length} \${text2.slice(0, 200).replace(/\\s+/g, " ")}\`);
`,
);

// 7. Keep the pre-0.2.0 channel behaviour. SDK 0.2.0 (#226) refuses to address a camera whose HomeBase
//    channel is missing or shared with another camera. Woody and Backyard are both T8425 on one HomeBase 3,
//    the exact pair that rule targets, and nobody has seen their channel numbers yet. Refusing would take
//    BOTH offline. This restores the old addressing (missing -> 0, shared -> the stated channel) until the
//    bridge's boot "camera channel map" log shows the real values. Remove once that log is read.
replaceOnce(
  "keep old channel addressing for missing/shared channels",
  `    else if (stated === void 0)
      out.set(d.sn, { issue: "missing" });
    else if ((claimants.get(station)?.get(stated) ?? 0) > 1)
      out.set(d.sn, { issue: "shared", claimed: stated });`,
  `    else if (stated === void 0)
      out.set(d.sn, { channel: 0 });
    else if ((claimants.get(station)?.get(stated) ?? 0) > 1)
      out.set(d.sn, { channel: stated });`,
);

writeFileSync(file, src);
console.log("[patch-push] all push fixes applied");
