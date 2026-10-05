const supabase = require("../config/supabase");

const COLUMNS = "id, name, description, price, stock, created_at";

function notFound(res) {
  return res.status(404).json({
    success: false,
    message: "Produk tidak ditemukan",
    code: "PRODUCT_NOT_FOUND",
  });
}

/* ============ ENDPOINT PUBLIK (client-facing) ============ */

async function listProducts(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from("products")
      .select(COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { products: data, pagination: { page, limit, total: count } },
    });
  } catch (err) {
    return next(err);
  }
}

async function getProduct(req, res, next) {
  try {
    const { data, error } = await supabase
      .from("products")
      .select(COLUMNS)
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFound(res);

    return res.status(200).json({ success: true, data: { product: data } });
  } catch (err) {
    return next(err);
  }
}

async function createProduct(req, res, next) {
  try {
    // Whitelist field: id & created_at tidak boleh diisi client
    const { name, description, price, stock } = req.body;

    const { data, error } = await supabase
      .from("products")
      .insert({ name, description, price, stock })
      .select(COLUMNS)
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: "Produk berhasil dibuat",
      data: { product: data },
    });
  } catch (err) {
    return next(err);
  }
}

async function updateProduct(req, res, next) {
  try {
    const allowed = ["name", "description", "price", "stock"];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Kirim minimal satu field: name, description, price, atau stock",
        code: "NO_FIELDS_TO_UPDATE",
      });
    }

    const { data, error } = await supabase
      .from("products")
      .update(updates)
      .eq("id", req.params.id)
      .select(COLUMNS)
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFound(res);

    return res.status(200).json({
      success: true,
      message: "Produk berhasil diperbarui",
      data: { product: data },
    });
  } catch (err) {
    return next(err);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const { data, error } = await supabase
      .from("products")
      .delete()
      .eq("id", req.params.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFound(res);

    return res
      .status(200)
      .json({ success: true, message: "Produk berhasil dihapus" });
  } catch (err) {
    return next(err);
  }
}

/* ============ ENDPOINT INTERNAL (dipanggil order-service) ============ */

async function getStock(req, res, next) {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("id, price, stock")
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFound(res);

    return res.status(200).json({
      success: true,
      data: { productId: data.id, price: data.price, stock: data.stock },
    });
  } catch (err) {
    return next(err);
  }
}

async function reduceStock(req, res, next) {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    const { data, error } = await supabase.rpc("reduce_stock", {
      p_id: id,
      p_qty: quantity,
    });

    if (error) throw error;

    // 0 baris = produk tidak ada ATAU stok tidak cukup. Cari tahu yang mana.
    if (!data || data.length === 0) {
      const { data: product, error: findError } = await supabase
        .from("products")
        .select("id, stock")
        .eq("id", id)
        .maybeSingle();

      if (findError) throw findError;
      if (!product) return notFound(res);

      return res.status(409).json({
        success: false,
        message: "Stok tidak mencukupi",
        code: "INSUFFICIENT_STOCK",
        data: { available: product.stock, requested: quantity },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Stok berhasil dikurangi",
      data: { productId: data[0].product_id, stock: data[0].new_stock },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getStock,
  reduceStock,
};
