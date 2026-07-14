import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://upshybaxpfywrymgaldu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_uZH0j9NIpLE65YLoSQWYdg_pptcF1xw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
