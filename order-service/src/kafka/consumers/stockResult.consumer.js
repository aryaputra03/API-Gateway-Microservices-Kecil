const supabase = require("../../config/supabase");

async function handle(env) {
  const { orderId, unitPrice, reason } = env.payload || {};
  if (!orderId) {
    const e = new Error("payload stock result tidak valid");
    e.poison = true;
    throw e;
  }

  // env.type berasal dari nama topic (lihat outboxRelay.js: payload.type || topic),
  // dan payload stock.reserved/stock.rejected memang tidak punya field "type" sendiri
  // -- jadi env.type di sini otomatis "stock.reserved" atau "stock.rejected".
  const result = env.type === "stock.reserved" ? "reserved" : "rejected";

  const { error } = await supabase.rpc("apply_stock_result", {
    p_order_id: orderId,
    p_result: result,
    p_unit_price: unitPrice || null,
    p_reason: reason || null,
  });
  if (error) throw error;

  console.log(
    `${new Date().toISOString()} [${env.requestId}] ${env.type} ${orderId} -> ${result}`,
  );
}

module.exports = { handle };
