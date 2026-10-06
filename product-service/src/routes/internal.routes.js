const express = require("express");
const { getStock, reduceStock } = require("../controllers/product.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const {
  idParam,
  reduceStockRules,
  handleValidation,
} = require("../middlewares/validator.middleware");

const router = express.Router();

// Semua endpoint internal wajib JWT (order-service meneruskan header Authorization dari client)
router.use(authenticate);

router.get("/products/:id/stock", idParam, handleValidation, getStock);
router.post(
  "/products/:id/reduce-stock",
  reduceStockRules,
  handleValidation,
  reduceStock,
);

module.exports = router;
