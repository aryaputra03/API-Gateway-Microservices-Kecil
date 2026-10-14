const express = require("express");
const {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/product.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware"); // << BARU
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

// Butuh JWT + role admin. authenticate dulu baru requireRole,
// supaya tanpa token = 401 (bukan 403), token valid tapi bukan admin = 403
router.post(
  "/",
  authenticate,
  requireRole("admin"),
  createRules,
  handleValidation,
  createProduct,
);
router.put(
  "/:id",
  authenticate,
  requireRole("admin"),
  updateRules,
  handleValidation,
  updateProduct,
);
router.delete(
  "/:id",
  authenticate,
  requireRole("admin"),
  idParam,
  handleValidation,
  deleteProduct,
);

module.exports = router;
