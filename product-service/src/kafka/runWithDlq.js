// Membungkus consumer.run() dengan retry terbatas + kirim ke DLQ kalau gagal terus.
// Dipanggil oleh startConsumer.js, bukan langsung dipakai dari app.js.
function runWithDlq({ consumer, producer, handle, maxAttempts = 3 }) {
  return consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const raw = message.value ? message.value.toString() : "";
      for (let attempt = 1; ; attempt++) {
        try {
          await handle(JSON.parse(raw), message.headers);
          return; // sukses -> lanjut ke pesan berikutnya
        } catch (err) {
          const poison = err instanceof SyntaxError || err.poison; // retry tidak ada gunanya
          if (poison || attempt >= maxAttempts) {
            await producer.send({
              topic: `${topic}.dlq`,
              messages: [
                {
                  key: message.key,
                  value: raw,
                  headers: {
                    error: String(err.message).slice(0, 200),
                    attempts: String(attempt),
                    origin: `${topic}/${partition}/${message.offset}`,
                  },
                },
              ],
            });
            return; // tetap lanjut ke pesan berikutnya -- partisi TIDAK macet
          }
          await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
        }
      }
    },
  });
}

module.exports = { runWithDlq };
