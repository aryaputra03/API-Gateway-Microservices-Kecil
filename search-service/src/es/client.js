const { Client } = require("@elastic/elasticsearch");

const node = process.env.ELASTICSEARCH_URL || "http://localhost:9200";

module.exports = new Client({ node });
