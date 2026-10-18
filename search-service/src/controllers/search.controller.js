const es = require("../es/client");

async function searchProducts(req, res, next) {
  try {
    const { q, minPrice, maxPrice } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;

    const must = q
      ? [
          {
            multi_match: {
              query: q,
              fields: ["name^3", "description"],
              fuzziness: "AUTO",
            },
          },
        ]
      : [{ match_all: {} }];

    const filter = [];
    if (minPrice !== undefined || maxPrice !== undefined) {
      const range = {};
      if (minPrice !== undefined) range.gte = Number(minPrice);
      if (maxPrice !== undefined) range.lte = Number(maxPrice);
      filter.push({ range: { price: range } });
    }

    const result = await es.search({
      index: "products",
      from: (page - 1) * limit,
      size: limit,
      query: { bool: { must, filter } },
      sort: q ? ["_score", { updatedAt: "desc" }] : [{ updatedAt: "desc" }],
    });

    const products = result.hits.hits.map((h) => ({ id: h._id, ...h._source }));

    return res.status(200).json({
      success: true,
      data: {
        products,
        pagination: { page, limit, total: result.hits.total.value },
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { searchProducts };
