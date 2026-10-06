const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const productRoutes = require("./routes/product.routes");
const internalRoutes = require("./routes/internal.routes");

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json({ limit: "10kb" }));

app.get("/health", (req, res) => {
  res
    .status(200)
    .json({ success: true, service: "product-service", status: "ok" });
});

app.use("/products", productRoutes);
app.use("/internal", internalRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} tidak ditemukan`,
    code: "ROUTE_NOT_FOUND",
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Body request bukan JSON yang valid",
      code: "INVALID_JSON",
    });
  }

  console.error(err);
  return res.status(500).json({
    success: false,
    message: "Terjadi kesalahan pada server",
    code: "INTERNAL_ERROR",
  });
});

module.exports = app;
