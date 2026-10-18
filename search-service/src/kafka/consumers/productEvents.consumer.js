const es = require("../../es/client");
const { upsert, remove } = require("../../es/indexer");

async function handle(env) {
  const { product, updatedAt } = env.payload || {};
  if (!product || !product.id) {
    const e = new Error("payload product.events tidak valid");
    e.poison = true;
    throw e;
  }

  if (env.type === "product.deleted") {
    await remove(es, product.id, updatedAt);
  } else {
    await upsert(es, product, updatedAt);
  }

  console.log(
    `${new Date().toISOString()} [${env.requestId}] ${env.type} ${product.id} -> indexed`,
  );
}

module.exports = { handle };
