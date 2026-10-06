const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const schema = process.env.DB_SCHEMA || "order";

if (!url || !key) {
  throw new Error(
    "SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di .env",
  );
}

module.exports = createClient(url, key, {
  db: { schema },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
