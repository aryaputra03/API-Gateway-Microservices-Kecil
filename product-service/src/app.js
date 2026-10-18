const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const productRoutes = require("./routes/product.routes");
const { requestId } = require("./middlewares/requestId.middleware");
const {
  kafka,
  kafkaStatus,
  startKafkaConnectionWatcher,
} = require("./config/kafka");
const { startOutboxRelay } = require("./kafka/outboxRelay"); // << BARU
const { startConsumer } = require("./kafka/startConsumer"); // << BARU
const { startRequestTraceConsumer } = require("./kafka/requestTraceConsumer");
const orderCreatedConsumer = require("./kafka/consumers/orderCreated.consumer"); // << BARU
const supabase = require("./config/supabase"); // << BARU

const { startOutboxCleanup } = require("./jobs/outboxCleanup.job");

const app = express();

const kafkaProducer = kafka.producer();
startKafkaConnectionWatcher(kafkaProducer);

// Relay outbox HANYA aktif di instance yang diberi OUTBOX_RELAY_ENABLED=true
// (diset lewat docker-compose -- cuma product-1, supaya product-2 tidak ikut
// menerbitkan event yang sama dua kali).
if (process.env.OUTBOX_RELAY_ENABLED === "true") {
  const pollMs = Number(process.env.OUTBOX_POLL_MS) || 1000;
  startOutboxRelay(supabase, kafkaProducer, pollMs);
  startOutboxCleanup(supabase);
}

// Consumer order.created AKTIF DI KEDUA instance, groupId SAMA --
// Kafka otomatis membagi 3 partisi topic order.created antara product-1 & product-2.
const orderCreatedKafkaConsumer = kafka.consumer({
  groupId: "product-service-order",
});
startConsumer(
  orderCreatedKafkaConsumer,
  kafkaProducer, // << BARU -- dibutuhkan untuk kirim ke DLQ
  ["order.created"],
  orderCreatedConsumer.handle, // << langsung fungsi handle, bukan wrapper manual lagi
  "consumer order.created",
);

// Observability-only group: every product replica logs the same order request
// ID without duplicating stock reservation work.
const requestTraceKafkaConsumer = startRequestTraceConsumer(kafka, "product");

app.locals.kafkaProducer = kafkaProducer;
app.locals.kafkaConsumer = orderCreatedKafkaConsumer;
app.locals.kafkaConsumers = [orderCreatedKafkaConsumer, requestTraceKafkaConsumer];

app.use(requestId);
app.use(helmet());
app.use(cors());
morgan.token("id", (req) => req.requestId || "-");
app.use(morgan(":date[iso] [:id] :method :url :status :response-time ms"));
app.use(express.json({ limit: "10kb" }));

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "product-service",
    status: "ok",
    kafka: kafkaStatus.connected ? "connected" : "disconnected",
  });
});

app.use("/products", productRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} tidak ditemukan`,
    code: "ROUTE_NOT_FOUND",
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Body request bukan JSON yang valid",
      code: "INVALID_JSON",
    });
  }
  console.error(err);
  return res.status(500).json({
    success: false,
    message: "Terjadi kesalahan pada server",
    code: "INTERNAL_ERROR",
  });
});

module.exports = app;
