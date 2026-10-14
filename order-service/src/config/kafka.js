const { Kafka, logLevel } = require("kafkajs");
const os = require("os");

const brokers = (process.env.KAFKA_BROKERS || "localhost:29092")
  .split(",")
  .map((b) => b.trim());

// clientId unik per container/instance -- kelihatan jelas siapa yang connect
// kalau dilihat dari kafka-ui, khususnya penting karena product-1 & product-2
// adalah 2 instance dari image yang sama.
const clientId = `order-service-${os.hostname()}`;

const kafka = new Kafka({
  clientId,
  brokers,
  logLevel: logLevel.NOTHING, // morgan sudah cukup untuk log HTTP; log internal kafkajs berisik kalau dinyalakan
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

// Dibaca oleh GET /health. SENGAJA tidak pernah bikin proses exit/crash
// cuma karena Kafka belum siap -- itu inti dari Fase 8.
const kafkaStatus = { connected: false };

// Reconnect dengan backoff eksponensial (maks 30 detik), berjalan di background,
// tidak pernah di-await oleh siapa pun supaya tidak memblokir start Express.
function startKafkaConnectionWatcher(producer) {
  let attempt = 0;

  async function tryConnect() {
    try {
      await producer.connect();
      kafkaStatus.connected = true;
      attempt = 0;
      console.log(`[kafka] producer tersambung (clientId=${clientId})`);
    } catch (err) {
      kafkaStatus.connected = false;
      attempt += 1;
      const delay = Math.min(30000, 1000 * 2 ** attempt);
      console.warn(
        `[kafka] gagal konek (percobaan ke-${attempt}): ${err.message}. Coba lagi dalam ${delay / 1000}s`,
      );
      setTimeout(tryConnect, delay);
    }
  }

  // Kalau koneksi yang tadinya sukses tiba-tiba putus (broker restart, dsb),
  // status ikut berubah dan watcher mencoba sambung lagi dari nol.
  producer.on(producer.events.DISCONNECT, () => {
    kafkaStatus.connected = false;
    console.warn("[kafka] producer terputus, mencoba konek ulang...");
    tryConnect();
  });

  tryConnect();
}

module.exports = { kafka, kafkaStatus, startKafkaConnectionWatcher, clientId };
