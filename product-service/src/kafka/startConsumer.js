const { runWithDlq } = require("./runWithDlq");

// Connect + subscribe + run (dibungkus retry+DLQ), dengan retry backoff
// kalau Kafka belum siap saat startup. TIDAK PERNAH melempar ke pemanggil.
function startConsumer(
  consumer,
  producer,
  topics,
  handle,
  label,
  maxAttempts = 3,
) {
  let attempt = 0;

  async function tryStart() {
    try {
      await consumer.connect();
      for (const topic of topics) {
        await consumer.subscribe({ topic, fromBeginning: false });
      }
      await runWithDlq({ consumer, producer, handle, maxAttempts });
      console.log(`[kafka] ${label} siap, subscribe ke: ${topics.join(", ")}`);
    } catch (err) {
      attempt += 1;
      const delay = Math.min(30000, 1000 * 2 ** attempt);
      console.warn(
        `[kafka] ${label} gagal start (percobaan ke-${attempt}): ${err.message}. Coba lagi dalam ${delay / 1000}s`,
      );
      setTimeout(tryStart, delay);
    }
  }

  tryStart();
}

module.exports = { startConsumer };
