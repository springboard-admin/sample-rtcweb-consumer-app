import { createClient } from "@supabase/supabase-js";

// Shared prod project (same as mentor-spark-link). The anon key is public.
const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — copy .env.example to .env.local");
}

export const supabase = createClient(url, key);
