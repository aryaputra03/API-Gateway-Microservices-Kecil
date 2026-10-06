const axios = require("axios");

const http = axios.create({
  baseURL: process.env.PRODUCT_SERVICE_URL || "http://localhost:4002",
  timeout: Number(process.env.PRODUCT_SERVICE_TIMEOUT_MS) || 3000, // WAJIB: cegah request menggantung
});

/**
 * Error khusus dengan "kind" yang menjawab pertanyaan:
 * "gagal total, lambat, atau ditolak secara bisnis?"
 */
class ProductServiceError extends Error {
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = "ProductServiceError";
    this.kind = kind;
    Object.assign(this, extra);
  }
}

function translateError(err) {
  // 1) product-service MEMBALAS, tapi dengan status error
  if (err.response) {
    const { status, data } = err.response;
    if (status === 404) {
      return new ProductServiceError("NOT_FOUND", "Produk tidak ditemukan");
    }
    if (status === 409) {
      return new ProductServiceError(
        "INSUFFICIENT_STOCK",
        "Stok tidak mencukupi",
        {
          details: data && data.data,
        },
      );
    }
    if (status === 401 || status === 403) {
      return new ProductServiceError(
        "REJECTED",
        "product-service menolak token",
      );
    }
    // Fase 5: sekarang ada Nginx di tengah. "Mati" dan "lambat" dilaporkan lewat 502/504
    if (status === 502 || status === 503) {
      return new ProductServiceError(
        "UNAVAILABLE",
        "product-service tidak dapat dihubungi",
      );
    }
    if (status === 504) {
      return new ProductServiceError(
        "TIMEOUT",
        "product-service tidak merespons tepat waktu",
      );
    }
    return new ProductServiceError(
      "BAD_RESPONSE",
      `product-service membalas status ${status}`,
      {
        upstreamStatus: status,
      },
    );
  }

  // 2) Request terkirim tapi TIDAK ada balasan dalam batas waktu -> LAMBAT
  if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
    return new ProductServiceError(
      "TIMEOUT",
      "product-service tidak merespons tepat waktu",
    );
  }

  // 3) Tidak bisa tersambung sama sekali -> MATI (ECONNREFUSED, ECONNRESET, ENOTFOUND, ...)
  return new ProductServiceError(
    "UNAVAILABLE",
    "product-service tidak dapat dihubungi",
    {
      networkCode: err.code,
    },
  );
}

// authHeader = nilai header Authorization milik client, diteruskan apa adanya
async function getStock(productId, authHeader) {
  try {
    const res = await http.get(
      `/internal/products/${encodeURIComponent(productId)}/stock`,
      {
        headers: { Authorization: authHeader },
      },
    );
    return res.data.data; // { productId, price, stock }
  } catch (err) {
    throw translateError(err);
  }
}

async function reduceStock(productId, quantity, authHeader) {
  try {
    const res = await http.post(
      `/internal/products/${encodeURIComponent(productId)}/reduce-stock`,
      { quantity },
      { headers: { Authorization: authHeader } },
    );
    return res.data.data; // { productId, stock }
  } catch (err) {
    throw translateError(err);
  }
}

module.exports = { getStock, reduceStock, ProductServiceError };
