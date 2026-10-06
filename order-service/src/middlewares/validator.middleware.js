const { body, param, query, validationResult } = require("express-validator");

const createOrderRules = [
  body("productId").isUUID().withMessage("productId harus berupa UUID"),
  body("quantity")
    .isInt({ min: 1, max: 1000 })
    .withMessage("quantity harus bilangan bulat 1–1000")
    .toInt(),
];

const idParam = [
  param("id").isUUID().withMessage("ID order harus berupa UUID"),
];

const listQuery = [
  query("page").optional().isInt({ min: 1 }).withMessage("page minimal 1"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit harus 1–100"),
];

function handleValidation(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validasi gagal",
      code: "VALIDATION_ERROR",
      errors: result.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

module.exports = { createOrderRules, idParam, listQuery, handleValidation };
