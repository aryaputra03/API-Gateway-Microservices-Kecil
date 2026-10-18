// Hapus baris outbox_events yang sudah published_at lebih dari OUTBOX_RETENTION_DAYS hari.
// Cukup jalan sekali sehari -- ini cuma jaga tabel tidak membengkak, bukan hal kritis waktu.
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = Number(process.env.OUTBOX_RETENTION_DAYS) || 7;

async function cleanupOutbox(supabase) {
  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("outbox_events")
    .delete()
    .not("published_at", "is", null)
    .lt("published_at", cutoff)
    .select("id");

  if (error) {
    console.error("[outbox-cleanup] gagal hapus:", error.message);
    return;
  }
  if (data && data.length > 0) {
    console.log(`[outbox-cleanup] ${data.length} baris outbox lama dihapus`);
  }
}

function startOutboxCleanup(supabase) {
  cleanupOutbox(supabase).catch((err) =>
    console.error("[outbox-cleanup] error:", err.message),
  );

  const timer = setInterval(() => {
    cleanupOutbox(supabase).catch((err) =>
      console.error("[outbox-cleanup] error:", err.message),
    );
  }, CLEANUP_INTERVAL_MS);

  process.on("SIGTERM", () => clearInterval(timer));
  return timer;
}

module.exports = { startOutboxCleanup, cleanupOutbox };
