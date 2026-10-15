const supabase = require("../config/supabase");
const productClient = require("../services/productClient");

const { ProductServiceError } = productClient;

const TEST_DELAY_MS = Number(process.env.TEST_DELAY_BEFORE_REDUCE_MS) || 0;
const ORDER_FLOW = process.env.ORDER_FLOW || "sync"; // << BARU: "sync" (default) atau "event"

const ORDER_SELECT =
  "id, status, created_at, order_items(id, product_id, quantity, price_at_time)";

const ERROR_MAP = {
  NOT_FOUND: [404, "PRODUCT_NOT_FOUND", "Produk tidak ditemukan"],
  INSUFFICIENT_STOCK: [409, "INSUFFICIENT_STOCK", "Stok tidak mencukupi"],
  TIMEOUT: [
    504,
    "PRODUCT_SERVICE_TIMEOUT",
    "Layanan produk tidak merespons tepat waktu, coba lagi nanti",
  ],
  UNAVAILABLE: [
    503,
    "PRODUCT_SERVICE_UNAVAILABLE",
    "Layanan produk sedang tidak tersedia, coba lagi nanti",
  ],
  REJECTED: [
    502,
    "PRODUCT_SERVICE_REJECTED",
    "Layanan produk menolak permintaan",
  ],
  BAD_RESPONSE: [
    502,
    "PRODUCT_SERVICE_ERROR",
    "Layanan produk mengembalikan respons tidak terduga",
  ],
};

function sendProductError(res, err, extraData) {
  const [status, code, message] = ERROR_MAP[err.kind] || ERROR_MAP.BAD_RESPONSE;
  const body = { success: false, message, code };
  const data = { ...(err.details || {}), ...(extraData || {}) };
  if (Object.keys(data).length > 0) body.data = data;
  return res.status(status).json(body);
}

function toResponse(row) {
  const items = row.order_items || [];
  // Selama status pending (alur event, belum dapat hasil dari product-service),
  // price_at_time semua item masih null -> total TIDAK BISA dihitung, jangan
  // ditampilkan sebagai 0 (menyesatkan), tampilkan null.
  const hasPrice =
    items.length > 0 && items.every((i) => i.price_at_time !== null);
  const total = hasPrice
    ? Math.round(
        items.reduce(
          (sum, i) => sum + Number(i.price_at_time) * i.quantity,
          0,
        ) * 100,
      ) / 100
    : null;
  return {
    id: row.id,
    status: row.status,
    total,
    items,
    created_at: row.created_at,
  };
}

async function markOrder(orderId, status, failureReason = null) {
  const update = { status };
  if (failureReason)
    update.failure_reason = String(failureReason).slice(0, 500);

  const { error } = await supabase
    .from("orders")
    .update(update)
    .eq("id", orderId);
  if (error) throw error;
}

async function fetchOrder(orderId, userId) {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ================= Cabang EVENT (BARU) ================= */
async function createOrderEventFlow(req, res, next) {
  try {
    const { productId, quantity } = req.body;
    const { userId } = req.user;
    const requestId = req.requestId;

    // Satu panggilan RPC: simpan order (status pending) + tulis outbox order.created,
    // SATU transaksi. Tidak ada panggilan HTTP ke product-service di sini sama sekali.
    const { data: orderId, error } = await supabase.rpc("create_order_event", {
      p_user_id: userId,
      p_product_id: productId,
      p_quantity: quantity,
      p_request_id: requestId || null,
    });
    if (error) throw error;

    return res.status(202).json({
      success: true,
      message: "Order diterima, sedang diproses",
      data: { orderId, status: "pending" },
    });
  } catch (err) {
    return next(err);
  }
}

/* ================= Cabang SYNC (kode lama, TIDAK diubah) ================= */
async function createOrderSyncFlow(req, res, next) {
  try {
    const { productId, quantity } = req.body;
    const { userId } = req.user;
    const authHeader = req.headers.authorization;
    const requestId = req.requestId;

    let product;
    try {
      product = await productClient.getStock(productId, authHeader, requestId);
    } catch (err) {
      if (err instanceof ProductServiceError) return sendProductError(res, err);
      throw err;
    }

    if (product.stock < quantity) {
      return res.status(409).json({
        success: false,
        message: "Stok tidak mencukupi",
        code: "INSUFFICIENT_STOCK",
        data: { available: product.stock, requested: quantity },
      });
    }

    const { data: orderId, error: createError } = await supabase.rpc(
      "create_order",
      {
        p_user_id: userId,
        p_product_id: productId,
        p_quantity: quantity,
        p_price: product.price,
      },
    );
    if (createError) throw createError;

    if (TEST_DELAY_MS > 0) await sleep(TEST_DELAY_MS);

    try {
      await productClient.reduceStock(
        productId,
        quantity,
        authHeader,
        requestId,
      );
    } catch (err) {
      if (!(err instanceof ProductServiceError)) throw err;

      try {
        await markOrder(orderId, "failed", `${err.kind}: ${err.message}`);
      } catch (markErr) {
        console.error(
          `Gagal menandai order ${orderId} sebagai failed:`,
          markErr,
        );
      }
      return sendProductError(res, err, { orderId, orderStatus: "failed" });
    }

    await markOrder(orderId, "confirmed");

    const order = await fetchOrder(orderId, userId);
    return res.status(201).json({
      success: true,
      message: "Order berhasil dibuat",
      data: { order: toResponse(order) },
    });
  } catch (err) {
    return next(err);
  }
}

/* ================= POST /orders -- dispatcher ================= */
async function createOrder(req, res, next) {
  if (ORDER_FLOW === "event") {
    return createOrderEventFlow(req, res, next);
  }
  return createOrderSyncFlow(req, res, next);
}

/* ================= GET /orders ================= */
async function listOrders(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from("orders")
      .select(ORDER_SELECT, { count: "exact" })
      .eq("user_id", req.user.userId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: {
        orders: data.map(toResponse),
        pagination: { page, limit, total: count },
      },
    });
  } catch (err) {
    return next(err);
  }
}

/* ================= GET /orders/:id ================= */
async function getOrder(req, res, next) {
  try {
    const order = await fetchOrder(req.params.id, req.user.userId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order tidak ditemukan",
        code: "ORDER_NOT_FOUND",
      });
    }

    return res
      .status(200)
      .json({ success: true, data: { order: toResponse(order) } });
  } catch (err) {
    return next(err);
  }
}

module.exports = { createOrder, listOrders, getOrder };
