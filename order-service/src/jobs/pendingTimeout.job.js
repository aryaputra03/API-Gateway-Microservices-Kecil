const supabase = require("../config/supabase");

const PENDING_TIMEOUT_MS = Number(process.env.PENDING_TIMEOUT_MS) || 120000;
const CHECK_INTERVAL_MS = 30000;

async function timeoutPendingOrders() {
  const cutoff = new Date(Date.now() - PENDING_TIMEOUT_MS).toISOString();

  const { data, error } = await supabase
    .from("orders")
    .update({ status: "failed", failure_reason: "PENDING_TIMEOUT" })
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error("[pending-timeout] gagal update:", error.message);
    return;
  }
  if (data && data.length > 0) {
    console.log(
      `[pending-timeout] ${data.length} order ditandai failed (PENDING_TIMEOUT)`,
    );
  }
}

function startPendingTimeoutJob() {
  const timer = setInterval(() => {
    timeoutPendingOrders().catch((err) =>
      console.error("[pending-timeout] error tak terduga:", err.message),
    );
  }, CHECK_INTERVAL_MS);

  process.on("SIGTERM", () => clearInterval(timer));
  return timer;
}

module.exports = { startPendingTimeoutJob, timeoutPendingOrders };
