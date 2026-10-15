// Pola sama persis di order-service dan product-service.
// Baca baris outbox yang belum published_at, kirim ke Kafka, tandai terkirim.

async function relayOnce(supabase, producer) {
  const { data: rows, error } = await supabase
    .from("outbox_events")
    .select("*")
    .is("published_at", null)
    .order("created_at")
    .limit(50);
  if (error) throw error;
  if (!rows.length) return 0;

  const byTopic = new Map();
  for (const r of rows) {
    const rid = (r.headers && r.headers["x-request-id"]) || "";
    const env = {
      eventId: r.id,
      type: r.payload.type || r.topic,
      version: 1,
      occurredAt: r.created_at,
      requestId: rid,
      payload: r.payload,
    };
    const list = byTopic.get(r.topic) || [];
    list.push({
      key: r.key,
      value: JSON.stringify(env),
      headers: { "x-request-id": String(rid) },
    });
    byTopic.set(r.topic, list);
  }

  await producer.sendBatch({
    topicMessages: [...byTopic].map(([topic, messages]) => ({ topic, messages })),
  });

  // Kalau proses crash PAS di antara sendBatch dan update ini, event akan
  // terkirim ULANG di polling berikutnya (published_at masih null). Ini
  // SENGAJA dibiarkan -- itu kenapa consumer-nya WAJIB idempotent
  // (lihat product.processed_events). Fase 10 akan membuktikan ini.
  await supabase
    .from("outbox_events")
    .update({ published_at: new Date().toISOString() })
    .in("id", rows.map((r) => r.id));

  return rows.length;
}

// Jalankan relayOnce() berulang tiap intervalMs, berhenti rapi saat SIGTERM.
function startOutboxRelay(supabase, producer, intervalMs) {
  let running = false; // cegah tumpang-tindih kalau relayOnce lambat

  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const n = await relayOnce(supabase, producer);
      if (n > 0) console.log(`[outbox] menerbitkan ${n} event`);
    } catch (err) {
      console.error("[outbox] gagal relay:", err.message);
    } finally {
      running = false;
    }
  }, intervalMs);

  process.on("SIGTERM", () => {
    clearInterval(timer);
    console.log("[outbox] relay dihentikan (SIGTERM)");
  });

  return timer;
}

module.exports = { relayOnce, startOutboxRelay };