const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const schema = process.env.DB_SCHEMA || "auth_service";

if (!url || !key) {
  throw new Error(
    "SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di .env",
  );
}

const supabase = createClient(url, key, {
  db: { schema },
  // Kita tidak pakai Supabase Auth, jadi matikan fitur session
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

module.exports = supabase;
