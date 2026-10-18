const express = require("express");
const { searchProducts } = require("../controllers/search.controller");
const {
  searchRules,
  handleValidation,
} = require("../middlewares/validator.middleware");

const router = express.Router();

// Publik -- sama seperti GET /api/products, tidak butuh login
router.get("/products", searchRules, handleValidation, searchProducts);

module.exports = router;
