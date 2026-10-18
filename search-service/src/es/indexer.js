// versi eksternal supaya event usang tidak menimpa data baru
async function upsert(es, p, updatedAt) {
  try {
    await es.index({
      index: "products",
      id: p.id,
      version: Date.parse(updatedAt),
      version_type: "external",
      document: {
        name: p.name,
        description: p.description,
        price: Number(p.price),
        stock: p.stock,
        updatedAt,
      },
    });
  } catch (err) {
    if (err.meta && err.meta.statusCode === 409) return; // sudah ada yang lebih baru
    throw err;
  }
}

async function remove(es, id, updatedAt) {
  try {
    await es.delete({
      index: "products",
      id,
      version: Date.parse(updatedAt),
      version_type: "external",
    });
  } catch (err) {
    const status = err.meta && err.meta.statusCode;
    if (status === 404 || status === 409) return; // sudah terhapus / event usang
    throw err;
  }
}

module.exports = { upsert, remove };
