const express = require("express");
const {
  createOrder,
  listOrders,
  getOrder,
} = require("../controllers/order.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const {
  createOrderRules,
  idParam,
  listQuery,
  handleValidation,
} = require("../middlewares/validator.middleware");

const router = express.Router();

// Semua endpoint order wajib login
router.use(authenticate);

router.post("/", createOrderRules, handleValidation, createOrder);
router.get("/", listQuery, handleValidation, listOrders);
router.get("/:id", idParam, handleValidation, getOrder);

module.exports = router;
