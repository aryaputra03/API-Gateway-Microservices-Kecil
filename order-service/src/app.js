const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const orderRoutes = require("./routes/order.routes");
const { requestId } = require("./middlewares/requestId.middleware");
const {
  kafka,
  kafkaStatus,
  startKafkaConnectionWatcher,
} = require("./config/kafka");
const { startOutboxRelay } = require("./kafka/outboxRelay"); // << BARU
const { startConsumer } = require("./kafka/startConsumer"); // << BARU
const stockResultConsumer = require("./kafka/consumers/stockResult.consumer"); // << BARU
const supabase = require("./config/supabase"); // << BARU

const app = express();

const kafkaProducer = kafka.producer();
startKafkaConnectionWatcher(kafkaProducer);

const OUTBOX_POLL_MS = Number(process.env.OUTBOX_POLL_MS) || 1000;
startOutboxRelay(supabase, kafkaProducer, OUTBOX_POLL_MS); // << BARU -- order-service cuma 1 instance, tidak perlu flag enable/disable

const { startPendingTimeoutJob } = require("./jobs/pendingTimeout.job"); // << BARU

const stockResultKafkaConsumer = kafka.consumer({
  groupId: "order-service-stock-result",
});

const { startOutboxCleanup } = require("./jobs/outboxCleanup.job"); // << BARU, taruh dekat require lain

startConsumer(
  stockResultKafkaConsumer,
  kafkaProducer, // << BARU
  ["stock.reserved", "stock.rejected"],
  stockResultConsumer.handle, // << langsung fungsi handle
  "consumer stock result",
);

startPendingTimeoutJob();
startOutboxCleanup(supabase);

app.locals.kafkaProducer = kafkaProducer;
app.locals.kafkaConsumer = stockResultKafkaConsumer;

app.use(requestId);
app.use(helmet());
app.use(cors());
morgan.token("id", (req) => req.requestId || "-");
app.use(morgan(":date[iso] [:id] :method :url :status :response-time ms"));
app.use(express.json({ limit: "10kb" }));

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "order-service",
    status: "ok",
    kafka: kafkaStatus.connected ? "connected" : "disconnected",
  });
});

app.use("/orders", orderRoutes);

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
