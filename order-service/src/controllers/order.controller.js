const supabase = require("../config/supabase");
const productClient = require("../services/productClient");

const { ProductServiceError } = productClient;

const TEST_DELAY_MS = Number(process.env.TEST_DELAY_BEFORE_REDUCE_MS) || 0;

// failure_reason sengaja TIDAK ikut dikirim ke client (bisa berisi detail internal)
const ORDER_SELECT =
  "id, status, created_at, order_items(id, product_id, quantity, price_at_time)";

// kind -> [HTTP status, code, pesan untuk client]
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
  const total = items.reduce(
    (sum, i) => sum + Number(i.price_at_time) * i.quantity,
    0,
  );
  return {
    id: row.id,
    status: row.status,
    total: Math.round(total * 100) / 100,
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
    .eq("user_id", userId) // hanya pemilik yang boleh melihat
    .maybeSingle();

  if (error) throw error;
  return data;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ================= POST /orders ================= */
async function createOrder(req, res, next) {
  try {
    const { productId, quantity } = req.body;
    const { userId } = req.user;
    const authHeader = req.headers.authorization;
    const requestId = req.requestId;

    // LANGKAH 1: tanya product-service, stok cukup? (belum ada yang disimpan)
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

    // LANGKAH 2: simpan order dengan status 'created' (order + item, satu transaksi)
    const { data: orderId, error: createError } = await supabase.rpc(
      "create_order",
      {
        p_user_id: userId,
        p_product_id: productId,
        p_quantity: quantity,
        p_price: product.price, // harga dibekukan saat order dibuat
      },
    );
    if (createError) throw createError;

    // (Hook pengujian: beri waktu untuk mematikan product-service di tengah proses)
    if (TEST_DELAY_MS > 0) await sleep(TEST_DELAY_MS);

    // LANGKAH 3: kurangi stok di product-service
    try {
      await productClient.reduceStock(
        productId,
        quantity,
        authHeader,
        requestId,
      );
    } catch (err) {
      if (!(err instanceof ProductServiceError)) throw err;

      // Tidak ada rollback lintas service: cukup tandai order sebagai failed
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

    // LANGKAH 4: sukses -> confirmed
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
