import { supabase } from "./supabase";

function parseBrowser(ua: string): { browser: string; is_mobile: boolean } {
  const is_mobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
  if (/Edg\//.test(ua)) return { browser: "Edge", is_mobile };
  if (/OPR\/|Opera\//.test(ua)) return { browser: "Opera", is_mobile };
  if (/Chrome\//.test(ua)) return { browser: "Chrome", is_mobile };
  if (/Firefox\//.test(ua)) return { browser: "Firefox", is_mobile };
  if (/Safari\//.test(ua)) return { browser: "Safari", is_mobile };
  return { browser: "Other", is_mobile };
}

/**
 * Logs a page open to the shared project's `log-page-visit` edge function — the
 * SAME trace mentor-spark-link emits (IP is captured server-side by the
 * function), so canary visits show up in /internal's page-visit view keyed by
 * the Canvas userId. Fire-and-forget; once per page.
 */
export function logPageVisit(canvasUserId: string, role: string, page: string) {
  const { browser, is_mobile } = parseBrowser(navigator.userAgent);
  supabase.functions.invoke("log-page-visit", {
    body: {
      userEmail: `${canvasUserId}@canary.test`,
      canvasUserId,
      role,
      page,
      browser,
      is_mobile,
    },
  });
}
