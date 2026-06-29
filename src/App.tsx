import { useEffect, useMemo, useRef, useState } from "react";
import {
  RtcCall,
  WhiteboardPanel,
  useBridgeCanvas,
  type WhiteboardHandle,
  type CallLifecycleEvent,
} from "webrtc-core";
import { supabase } from "./supabase";
import { logPageVisit } from "./logPageVisit";

// ---------------------------------------------------------------------------
// webrtc-core CANARY / regression gate.
//
// Installs webrtc-core as a package (file:../webrtc-core) and drives it like a
// real consumer. Identity is the Canvas userId (REQUIRED via ?userId=) so EVERY
// trace this canary produces — page-open/IP visits, webrtc telemetry,
// diagnostics, participants — merges into the shared project keyed by the same
// person. A mentor here and a coach elsewhere roll up to one contractor in
// /internal. (Session-level /internal views that join call_sessions are an
// app-side upgrade handled later — the core deliberately stays role-agnostic.)
// ---------------------------------------------------------------------------

const params = new URLSearchParams(window.location.search);
const get = (k: string) => params.get(k) || "";

function UserIdGate() {
  const [val, setVal] = useState("");
  const go = () => {
    if (!val.trim()) return;
    const q = new URLSearchParams(window.location.search);
    q.set("userId", val.trim());
    window.location.search = q.toString();
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="w-full max-w-md space-y-3 border border-border rounded-lg p-5">
        <h1 className="text-lg font-bold">Canvas userId required</h1>
        <p className="text-xs text-muted-foreground">
          Every page needs a Canvas <code>userId</code> so all traces merge into one
          place across apps. Append <code>?userId=&lt;canvasId&gt;</code> or enter it:
        </p>
        <input
          className="w-full border border-border rounded px-2 py-1 text-sm"
          placeholder="canvas user id"
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
        <button onClick={go} className="w-full bg-primary text-primary-foreground rounded py-2 text-sm font-medium">
          Continue
        </button>
      </div>
    </div>
  );
}

function CanvasBridgeView({ userId }: { userId: string }) {
  const sessionId = get("sessionId");
  const role = get("role") || "ipad";
  const bridgeKey = get("key");
  const wbRef = useRef<WhiteboardHandle | null>(null);
  const bridge = useBridgeCanvas({ supabase, sessionId, role: `${role}:${userId}`, bridgeKey, wbHandle: wbRef.current });

  useEffect(() => { logPageVisit(userId, role, "/canary/canvas"); }, [userId, role]);

  return (
    <div className="fixed inset-0">
      <div className="absolute top-2 left-2 z-10 text-xs bg-black/70 text-white px-2 py-1 rounded">
        bridge: {bridge.status}
      </div>
      <WhiteboardPanel
        ref={wbRef}
        remoteRole={role}
        onLocalChange={(els) => bridge.sendDelta(els)}
        onPointerUpdate={(p) => bridge.sendPointer(p)}
      />
    </div>
  );
}

function CallView(props: {
  roomId: string;
  userId: string;
  role: string;
  peerRole: string;
  signalingRole: "initiator" | "responder";
}) {
  const { roomId, userId, role, peerRole, signalingRole } = props;
  const [log, setLog] = useState<string[]>([]);
  const [ended, setEnded] = useState(false);

  useEffect(() => { logPageVisit(userId, role, "/canary/call"); }, [userId, role]);

  const onLifecycle = (e: CallLifecycleEvent) => {
    setLog((l) => [`${new Date().toLocaleTimeString()} ${e.type}`, ...l].slice(0, 12));
  };

  if (ended) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background text-foreground">
        <p className="text-lg font-semibold">Call ended.</p>
        <a className="text-primary underline" href={`${window.location.pathname}?userId=${userId}`}>Back to lobby</a>
        <pre className="text-xs text-muted-foreground mt-4">{log.join("\n")}</pre>
      </div>
    );
  }

  return (
    <RtcCall
      supabase={supabase}
      roomId={roomId}
      self={{ id: userId, role }}
      peerRole={peerRole}
      signalingRole={signalingRole}
      selfName={`${role} (${userId})`}
      buildBridgeUrl={({ sessionId, role: r, bridgeKey }) =>
        `${window.location.origin}${window.location.pathname}?userId=${userId}&view=canvas&sessionId=${sessionId}&role=ipad-${r}&key=${bridgeKey}`}
      slots={{
        peerInfo: (
          <div className="p-4 text-sm text-gray-800">
            <p className="font-semibold mb-1">Peer-info slot</p>
            <p className="text-gray-500">
              App-provided business UI (e.g. Canvas course health). The core stays
              business-logic-free; this proves the injected slot works.
            </p>
          </div>
        ),
      }}
      onLifecycle={onLifecycle}
      onCallEnd={({ wasConnected }) => {
        setLog((l) => [`onCallEnd wasConnected=${wasConnected}`, ...l]);
        setEnded(true);
      }}
    />
  );
}

function Lobby({ userId }: { userId: string }) {
  const rand = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const [roomId, setRoomId] = useState(get("roomId") || crypto.randomUUID());
  const [role, setRole] = useState(get("role") || "student");
  const [peerRole, setPeerRole] = useState(get("peerRole") || "coach");
  const [signalingRole, setSignalingRole] = useState<"initiator" | "responder">(
    (get("signalingRole") as "initiator" | "responder") || "initiator",
  );

  useEffect(() => { logPageVisit(userId, "lobby", "/canary"); }, [userId]);

  const start = () => {
    const q = new URLSearchParams({ userId, roomId, role, peerRole, signalingRole });
    window.location.search = q.toString();
  };

  const field = "w-full border border-border rounded px-2 py-1 text-sm";
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="w-full max-w-md space-y-3 border border-border rounded-lg p-5">
        <h1 className="text-lg font-bold">webrtc-core canary</h1>
        <p className="text-xs text-muted-foreground">
          Canvas user: <code>{userId}</code> · session {rand}. Open in two browsers with the
          SAME roomId — one <code>initiator</code>, one <code>responder</code>, mirrored roles.
        </p>
        <label className="block text-xs">roomId (unique per call)
          <input className={field} value={roomId} onChange={(e) => setRoomId(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <label className="block text-xs flex-1">my role
            <input className={field} value={role} onChange={(e) => setRole(e.target.value)} />
          </label>
          <label className="block text-xs flex-1">peer role
            <input className={field} value={peerRole} onChange={(e) => setPeerRole(e.target.value)} />
          </label>
        </div>
        <label className="block text-xs">signaling role
          <select className={field} value={signalingRole} onChange={(e) => setSignalingRole(e.target.value as any)}>
            <option value="initiator">initiator (offerer)</option>
            <option value="responder">responder</option>
          </select>
        </label>
        <button onClick={start} className="w-full bg-primary text-primary-foreground rounded py-2 text-sm font-medium">
          Join call
        </button>
      </div>
    </div>
  );
}

export function App() {
  const userId = get("userId");
  if (!userId) return <UserIdGate />;
  if (get("view") === "canvas") return <CanvasBridgeView userId={userId} />;
  const roomId = get("roomId");
  if (roomId) {
    return (
      <CallView
        roomId={roomId}
        userId={userId}
        role={get("role") || "student"}
        peerRole={get("peerRole") || "coach"}
        signalingRole={(get("signalingRole") as "initiator" | "responder") || "initiator"}
      />
    );
  }
  return <Lobby userId={userId} />;
}
