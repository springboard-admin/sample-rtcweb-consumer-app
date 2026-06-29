import { useEffect, useRef, useState } from "react";
import {
  RtcCall,
  WhiteboardPanel,
  useBridgeCanvas,
  type WhiteboardHandle,
  type CallLifecycleEvent,
} from "webrtc-core";
import { supabase } from "./supabase";
import { logPageVisit } from "./logPageVisit";
import { openLegacySession, closeLegacySession } from "./legacyCallSession";

// ---------------------------------------------------------------------------
// webrtc-core CANARY / regression gate.
//
// Installs webrtc-core as a package and drives it like a real consumer. Every
// call/trace is keyed by a Canvas userId so logs across all apps merge in the
// shared project. The lobby collects BOTH users once and emits a copyable peer
// link, so testing is one click + paste (no typing roomId).
// ---------------------------------------------------------------------------

const params = new URLSearchParams(window.location.search);
const get = (k: string) => params.get(k) || "";

function MissingUserId() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="max-w-md text-center space-y-2">
        <p className="font-semibold">Missing userId.</p>
        <a className="text-primary underline" href={window.location.pathname}>Go to setup</a>
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
      <div className="absolute top-2 left-2 z-10 text-xs bg-black/70 text-white px-2 py-1 rounded">bridge: {bridge.status}</div>
      <WhiteboardPanel ref={wbRef} remoteRole={role} onLocalChange={(els) => bridge.sendDelta(els)} onPointerUpdate={(p) => bridge.sendPointer(p)} />
    </div>
  );
}

function CallView(props: { roomId: string; userId: string; peerId: string; role: string; peerRole: string; signalingRole: "initiator" | "responder" }) {
  const { roomId, userId, peerId, role, peerRole, signalingRole } = props;
  const [log, setLog] = useState<string[]>([]);
  const [ended, setEnded] = useState(false);
  const joinedAtRef = useRef<number | null>(null);
  const legacyRef = useRef(false);

  useEffect(() => { logPageVisit(userId, role, "/canary/call"); }, [userId, role]);

  // LEGACY SHIM: also write call_sessions for an official mentor/student pair so
  // the call shows in /internal's Call Sessions tab (id = roomId == core call_id).
  useEffect(() => {
    if (legacyRef.current) return;
    legacyRef.current = true;
    joinedAtRef.current = Date.now();
    openLegacySession({ roomId, myId: userId, myRole: role, peerId, peerRole })
      .then((ok) => setLog((l) => [`legacy call_sessions: ${ok ? "written" : "skipped (not an official mentor/student pair)"}`, ...l]))
      .catch(() => {});
  }, [roomId, userId, peerId, role, peerRole]);

  const endLegacy = () => { void closeLegacySession({ roomId, myRole: role, joinedAtMs: joinedAtRef.current }); };

  if (ended) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background text-foreground">
        <p className="text-lg font-semibold">Call ended.</p>
        <a className="text-primary underline" href={window.location.pathname}>New call</a>
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
            <p className="text-gray-500">App-provided business UI. The core stays business-logic-free.</p>
          </div>
        ),
      }}
      onLifecycle={(e: CallLifecycleEvent) => setLog((l) => [`${new Date().toLocaleTimeString()} ${e.type}`, ...l].slice(0, 12))}
      onCallEnd={() => { endLegacy(); setEnded(true); }}
    />
  );
}

function Lobby() {
  const [roomId] = useState(() => crypto.randomUUID());
  const [myId, setMyId] = useState(get("myId") || "");
  const [myRole, setMyRole] = useState("mentor");
  const [peerId, setPeerId] = useState("");
  const [peerRole, setPeerRole] = useState("student");
  const [copied, setCopied] = useState(false);

  const base = `${window.location.origin}${window.location.pathname}`;
  const linkFor = (id: string, peerUserId: string, role: string, otherRole: string, sig: "initiator" | "responder") =>
    `${base}?userId=${encodeURIComponent(id)}&peerUserId=${encodeURIComponent(peerUserId)}&roomId=${roomId}&role=${encodeURIComponent(role)}&peerRole=${encodeURIComponent(otherRole)}&signalingRole=${sig}`;

  const ready = myId.trim() && peerId.trim();
  const myLink = linkFor(myId.trim(), peerId.trim(), myRole, peerRole, "initiator");
  const peerLink = linkFor(peerId.trim(), myId.trim(), peerRole, myRole, "responder");

  const copyPeer = async () => {
    await navigator.clipboard.writeText(peerLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const field = "w-full border border-border rounded px-2 py-1 text-sm";
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="w-full max-w-md space-y-4 border border-border rounded-lg p-5">
        <div>
          <h1 className="text-lg font-bold">webrtc-core canary</h1>
          <p className="text-xs text-muted-foreground">Set both Canvas users once. roomId is auto-generated; share the peer link.</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">You (initiator)</p>
          <div className="flex gap-2">
            <input className={field} placeholder="my canvas userId" value={myId} onChange={(e) => setMyId(e.target.value)} />
            <input className={field} placeholder="my role" value={myRole} onChange={(e) => setMyRole(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Peer (responder)</p>
          <div className="flex gap-2">
            <input className={field} placeholder="peer canvas userId" value={peerId} onChange={(e) => setPeerId(e.target.value)} />
            <input className={field} placeholder="peer role" value={peerRole} onChange={(e) => setPeerRole(e.target.value)} />
          </div>
        </div>

        <button
          disabled={!ready}
          onClick={copyPeer}
          className="w-full border border-border rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {copied ? "Peer link copied ✓" : "Copy peer link"}
        </button>

        <a
          href={ready ? myLink : undefined}
          aria-disabled={!ready}
          className={`block text-center w-full bg-primary text-primary-foreground rounded py-2 text-sm font-medium ${ready ? "" : "opacity-50 pointer-events-none"}`}
        >
          Join as initiator
        </a>

        <p className="text-[11px] text-muted-foreground break-all">
          roomId: <code>{roomId}</code>
        </p>
      </div>
    </div>
  );
}

export function App() {
  const view = get("view");
  const userId = get("userId");
  const roomId = get("roomId");

  if (view === "canvas") return userId ? <CanvasBridgeView userId={userId} /> : <MissingUserId />;
  if (roomId && userId) {
    return (
      <CallView
        roomId={roomId}
        userId={userId}
        peerId={get("peerUserId")}
        role={get("role") || "student"}
        peerRole={get("peerRole") || "coach"}
        signalingRole={(get("signalingRole") as "initiator" | "responder") || "initiator"}
      />
    );
  }
  return <Lobby />;
}
