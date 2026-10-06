const express = require("express");
const {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/product.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const {
  idParam,
  listQuery,
  createRules,
  updateRules,
  handleValidation,
} = require("../middlewares/validator.middleware");

const router = express.Router();

// Publik: tanpa login
router.get("/", listQuery, handleValidation, listProducts);
router.get("/:id", idParam, handleValidation, getProduct);

// Butuh JWT. authenticate ditaruh SEBELUM validasi supaya tanpa token = 401, bukan 400
router.post("/", authenticate, createRules, handleValidation, createProduct);
router.put("/:id", authenticate, updateRules, handleValidation, updateProduct);
router.delete("/:id", authenticate, idParam, handleValidation, deleteProduct);

module.exports = router;
