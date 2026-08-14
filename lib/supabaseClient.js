import { createClient } from "@supabase/supabase-js";

// Public project values (safe in the browser: the publishable/anon key is designed to be
// exposed and data is protected by RLS). Used as fallback if env vars aren't present.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://oikrnlldqqliqkvqtigj.supabase.co";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_kw_cgLVeaBhDtPy9q84qMg_MmzTCPhP";

export const supabase = createClient(URL, ANON);
