const mapping = require("./mapping");

async function ensureIndex(es) {
  const exists = await es.indices.exists({ index: "products" });
  if (!exists) {
    await es.indices.create({ index: "products", ...mapping });
    console.log("[es] index 'products' dibuat");
  } else {
    console.log("[es] index 'products' sudah ada");
  }
}

// Dipanggil saat startup. ES mungkin belum siap (cold start) -- retry backoff,
// TIDAK PERNAH melempar ke pemanggil, konsisten dengan pola Kafka di Fase 8.
function ensureIndexResilient(es) {
  let attempt = 0;
  async function tryEnsure() {
    try {
      await ensureIndex(es);
    } catch (err) {
      attempt += 1;
      const delay = Math.min(30000, 1000 * 2 ** attempt);
      console.warn(
        `[es] gagal ensureIndex (percobaan ke-${attempt}): ${err.message}. Coba lagi dalam ${delay / 1000}s`,
      );
      setTimeout(tryEnsure, delay);
    }
  }
  tryEnsure();
}

module.exports = { ensureIndex, ensureIndexResilient };
