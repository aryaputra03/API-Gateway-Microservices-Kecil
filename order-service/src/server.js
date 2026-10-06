require("dotenv").config();

const app = require("./app");

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET belum di-set atau terlalu pendek. Salin dari auth-service/.env",
  );
}

const PORT = process.env.PORT || 4004;

app.listen(PORT, () => {
  console.log(`order-service berjalan di http://localhost:${PORT}`);
  console.log(
    `  -> product-service: ${process.env.PRODUCT_SERVICE_URL || "http://localhost:4002"}`,
  );
});
