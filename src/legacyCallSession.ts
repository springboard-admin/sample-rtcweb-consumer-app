import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// LEGACY call_sessions shim (consumer-side, NOT core).
//
// The core is role-agnostic and writes only the generic call_participants. This
// shim — gated to an official mentor↔student pair — ALSO writes the legacy
// `call_sessions` row so the call shows in /internal's existing "Call Sessions"
// tab. It's a prototype of the wrapper mentor-spark-link will use when it
// migrates onto the core.
//
// Key trick: we insert with id = roomId, so call_sessions.id == the core's
// call_id (telemetry/participants), and the tab + its telemetry drill-down both
// resolve to the same call. Only works for a real mentor/student pair (FKs);
// any other roles → no-op (call_participants still covers them).
// ---------------------------------------------------------------------------

function resolvePair(myRole: string, peerRole: string, myId: string, peerId: string) {
  if (myRole === "mentor" && peerRole === "student") return { mentorCanvas: myId, studentCanvas: peerId };
  if (myRole === "student" && peerRole === "mentor") return { mentorCanvas: peerId, studentCanvas: myId };
  return null;
}

export async function openLegacySession(opts: {
  roomId: string;
  myId: string;
  myRole: string;
  peerId: string;
  peerRole: string;
}): Promise<boolean> {
  const r = resolvePair(opts.myRole, opts.peerRole, opts.myId, opts.peerId);
  if (!r || !opts.peerId) return false; // not a mentor/student call

  const [{ data: mentor }, { data: student }] = await Promise.all([
    supabase.from("mentors").select("id").eq("canvas_user_id", r.mentorCanvas).maybeSingle(),
    supabase.from("students").select("id").eq("canvas_user_id", r.studentCanvas).maybeSingle(),
  ]);
  if (!mentor || !student) return false;

  const { data: pair } = await supabase
    .from("mentor_student_pairs")
    .select("id")
    .eq("mentor_id", (mentor as any).id)
    .eq("student_id", (student as any).id)
    .maybeSingle();
  if (!pair) return false; // not an official pair

  const now = new Date().toISOString();
  const joinCol = opts.myRole === "mentor" ? "mentor_joined_at" : "student_joined_at";
  // Both peers upsert by id=roomId; each sets only its own join column, so they
  // merge into one row without a create/find race.
  await supabase.from("call_sessions").upsert(
    {
      id: opts.roomId,
      pair_id: (pair as any).id,
      mentor_id: (mentor as any).id,
      student_id: (student as any).id,
      started_at: now,
      [joinCol]: now,
    } as any,
    { onConflict: "id" },
  );
  return true;
}

export async function closeLegacySession(opts: { roomId: string; myRole: string; joinedAtMs: number | null }) {
  const now = new Date();
  const leftCol = opts.myRole === "mentor" ? "mentor_left_at" : "student_left_at";
  await supabase
    .from("call_sessions")
    .update({
      ended_at: now.toISOString(),
      [leftCol]: now.toISOString(),
      duration_seconds: opts.joinedAtMs ? Math.round((now.getTime() - opts.joinedAtMs) / 1000) : 0,
    } as any)
    .eq("id", opts.roomId);
}
