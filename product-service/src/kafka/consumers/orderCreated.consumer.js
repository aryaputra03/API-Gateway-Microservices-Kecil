const supabase = require("../../config/supabase");

async function handle(env) {
  const { orderId, productId, quantity } = env.payload || {};
  if (!orderId || !productId || !Number.isInteger(quantity) || quantity < 1) {
    const e = new Error("payload order.created tidak valid");
    e.poison = true; // ditandai -- berguna di Fase 10 untuk langsung ke DLQ, tanpa retry
    throw e;
  }

  const { data, error } = await supabase.rpc("reserve_stock_for_order", {
    p_event_id: env.eventId,
    p_order_id: orderId,
    p_product_id: productId,
    p_qty: quantity,
    p_request_id: env.requestId || null,
  });
  if (error) throw error; // error DB dianggap sementara -> boleh retry (Fase 10)

  console.log(
    `${new Date().toISOString()} [${env.requestId}] order.created ${orderId} -> ${data}`,
  );
}

module.exports = { handle };
