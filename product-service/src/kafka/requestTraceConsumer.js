const os = require("os");

function startRequestTraceConsumer(kafka, serviceName) {
  const instance = os.hostname();
  const consumer = kafka.consumer({
    // Separate group per replica: each instance observes the event for tracing,
    // while the business consumer group still processes it only once.
    groupId: `request-trace-${serviceName}-${instance}`,
  });

  let attempt = 0;
  async function start() {
    try {
      await consumer.connect();
      await consumer.subscribe({ topic: "order.created", fromBeginning: false });
      await consumer.run({
        eachMessage: async ({ message }) => {
          let event;
          try {
            event = JSON.parse(message.value.toString());
          } catch (_) {
            console.warn(`[trace] ${serviceName} received invalid order.created JSON`);
            return;
          }

          const requestId =
            event.requestId || message.headers?.["x-request-id"]?.toString();
          if (!requestId) return;

          const orderId = event.payload?.orderId || "unknown-order";
          console.log(
            `${new Date().toISOString()} [${requestId}] trace order.created ${orderId} observed`,
          );
        },
      });
      attempt = 0;
      console.log(`[kafka] trace consumer ${serviceName} siap (instance=${instance})`);
    } catch (err) {
      attempt += 1;
      try {
        await consumer.disconnect();
      } catch (_) {
        // The consumer may not have connected yet.
      }
      const delay = Math.min(30000, 1000 * 2 ** attempt);
      console.warn(
        `[kafka] trace consumer ${serviceName} gagal start: ${err.message}. Coba lagi dalam ${delay / 1000}s`,
      );
      setTimeout(start, delay);
    }
  }

  start();
  return consumer;
}

module.exports = { startRequestTraceConsumer };
