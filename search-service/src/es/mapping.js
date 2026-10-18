module.exports = {
  settings: { number_of_shards: 1, number_of_replicas: 0 },
  mappings: {
    properties: {
      name: { type: "text", fields: { keyword: { type: "keyword" } } },
      description: { type: "text" },
      price: { type: "scaled_float", scaling_factor: 100 },
      stock: { type: "integer" },
      updatedAt: { type: "date" },
    },
  },
};
