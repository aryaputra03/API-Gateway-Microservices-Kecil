const axios = require("axios");

const http = axios.create({
  baseURL: process.env.PRODUCT_SERVICE_URL || "http://localhost:4002",
  timeout: Number(process.env.PRODUCT_SERVICE_TIMEOUT_MS) || 3000,
});

class ProductServiceError extends Error {
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = "ProductServiceError";
    this.kind = kind;
    Object.assign(this, extra);
  }
}

// Error yang berarti "request pasti belum sampai ke server" -> selalu aman diulang
const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
]);
const TIMEOUT_ERROR_CODES = new Set(["ECONNABORTED", "ETIMEDOUT"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Menjalankan requestFn dengan retry, HANYA untuk error koneksi (selalu)
 * dan timeout (hanya jika retryOnTimeout = true, dipakai untuk operasi baca).
 * err.response berarti server MEMBALAS (walau isinya error bisnis) -> tidak pernah diulang di sini.
 */
async function callWithRetry(requestFn, { retries, retryOnTimeout, label }) {
  let attempt = 0;
  for (;;) {
    try {
      return await requestFn();
    } catch (err) {
      const hasReply = Boolean(err.response);
      const isConnError = !hasReply && CONNECTION_ERROR_CODES.has(err.code);
      const isTimeout = !hasReply && TIMEOUT_ERROR_CODES.has(err.code);
      const canRetry = isConnError || (retryOnTimeout && isTimeout);

      if (!canRetry || attempt >= retries) throw err;

      attempt += 1;
      const delay = 150 * attempt; // backoff kecil: 150ms, lalu 300ms
      console.warn(
        `[retry] ${label} percobaan ${attempt}/${retries} setelah ${err.code} (delay ${delay}ms)`,
      );
      await sleep(delay);
    }
  }
}

function translateError(err) {
  if (err.response) {
    const { status, data } = err.response;
    if (status === 404)
      return new ProductServiceError("NOT_FOUND", "Produk tidak ditemukan");
    if (status === 409) {
      return new ProductServiceError(
        "INSUFFICIENT_STOCK",
        "Stok tidak mencukupi",
        { details: data && data.data },
      );
    }
    if (status === 401 || status === 403) {
      return new ProductServiceError(
        "REJECTED",
        "product-service menolak token",
      );
    }
    // Fase 5: ada Nginx di tengah, "mati"/"lambat" dilaporkan lewat 502/504
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
      { upstreamStatus: status },
    );
  }

  if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
    return new ProductServiceError(
      "TIMEOUT",
      "product-service tidak merespons tepat waktu",
    );
  }

  return new ProductServiceError(
    "UNAVAILABLE",
    "product-service tidak dapat dihubungi",
    { networkCode: err.code },
  );
}

async function getStock(productId, authHeader, requestId) {
  try {
    const res = await callWithRetry(
      () =>
        http.get(`/internal/products/${encodeURIComponent(productId)}/stock`, {
          headers: { Authorization: authHeader, "X-Request-Id": requestId },
        }),
      { retries: 2, retryOnTimeout: true, label: "getStock" }, // operasi baca: boleh diulang lebih berani
    );
    return res.data.data;
  } catch (err) {
    throw translateError(err);
  }
}

async function reduceStock(productId, quantity, authHeader, requestId) {
  try {
    const res = await callWithRetry(
      () =>
        http.post(
          `/internal/products/${encodeURIComponent(productId)}/reduce-stock`,
          { quantity },
          { headers: { Authorization: authHeader, "X-Request-Id": requestId } },
        ),
      { retries: 1, retryOnTimeout: false, label: "reduceStock" }, // operasi tulis: lebih hati-hati
    );
    return res.data.data;
  } catch (err) {
    throw translateError(err);
  }
}

module.exports = { getStock, reduceStock, ProductServiceError };
