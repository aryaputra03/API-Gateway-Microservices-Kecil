const supabase = require("../config/supabase");

const ORDER_SELECT =
  "id, status, created_at, order_items(id, product_id, quantity, price_at_time)";

function toResponse(row) {
  const items = row.order_items || [];
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

/* ================= POST /orders ================= */
async function createOrder(req, res, next) {
  try {
    const { productId, quantity } = req.body;
    const { userId } = req.user;
    const requestId = req.requestId;

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
