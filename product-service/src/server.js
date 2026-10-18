require("dotenv").config();

const app = require("./app");

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET belum di-set atau terlalu pendek. Salin dari auth-service/.env",
  );
}

const PORT = process.env.PORT || 4002;

const server = app.listen(PORT, () => {
  console.log(`product-service berjalan di http://localhost:${PORT}`);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM diterima, graceful shutdown...");
  try {
    if (app.locals.kafkaConsumer) await app.locals.kafkaConsumer.disconnect();
    if (app.locals.kafkaProducer) await app.locals.kafkaProducer.disconnect();
  } catch (err) {
    console.error("Error saat disconnect Kafka:", err.message);
  } finally {
    server.close(() => {
      console.log("HTTP server ditutup.");
      process.exit(0);
    });
  }
});
