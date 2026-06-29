# sample-rtcweb-consumer-app — webrtc-core canary

The **permanent regression gate** for [`webrtc-core`](../webrtc-core). It installs
the core **as a package** (`file:../webrtc-core`) and drives it exactly like a real
consumer, so any core change can be proven not to break downstream apps before release.

> Not throwaway. Run it after every core change.

## Setup

```bash
# 1) build the core (the file: dep installs its built dist/)
cd ../webrtc-core && npm install && npm run build

# 2) install + run the canary
cd ../sample-rtcweb-consumer-app
npm install
cp .env.example .env.local   # already filled with the shared prod project
npm run dev                   # http://localhost:5180
```

After changing the core: rebuild it (`npm run build` in webrtc-core; or `npm run dev`
there for watch) and reinstall here (`npm install`) to pick up the new `dist/`.

## How to test (two browsers)

1. Open `http://localhost:5180` in two browsers/devices.
2. Same **roomId** in both; one **initiator**, one **responder**; mirrored roles
   (e.g. `student` ↔ `coach`, and also try `mentor` ↔ `student`).
3. Exercise: connect, reconnect (kill wifi briefly), **mobile background** (switch
   apps on a phone), whiteboard, screen-share, in-call chat, audio-only, device
   switch. The "share to device" (Tablet) opens the iPad bridge view
   (`?view=canvas`).
4. Verify rows land in the shared Supabase project: `call_participants`,
   `call_telemetry`, `webrtc_diagnostics`.

Identity here comes from the URL/lobby; in a real consumer it comes from Canvas LMS.

## What this guards

The core's public surface: `RtcCall`, `usePairChat`/`PairChatThread`,
`useBridgeCanvas`/`WhiteboardPanel`, `generateBridgeKey` — plus packaging
(exports, types, CSS, peer-deps) that only a real package install reveals.
