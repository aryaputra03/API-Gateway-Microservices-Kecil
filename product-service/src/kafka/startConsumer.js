// Connect + subscribe + run, dengan retry backoff kalau Kafka belum siap.
// TIDAK PERNAH melempar ke pemanggil -- service tetap hidup walau Kafka down.
function startConsumer(consumer, topics, eachMessage, label) {
  let attempt = 0;

  async function tryStart() {
    try {
      await consumer.connect();
      for (const topic of topics) {
        await consumer.subscribe({ topic, fromBeginning: false });
      }
      await consumer.run({ eachMessage });
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
