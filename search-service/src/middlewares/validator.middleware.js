const { query, validationResult } = require("express-validator");

const searchRules = [
  query("q").optional().isString().trim().isLength({ max: 200 }),
  query("minPrice").optional().isFloat({ min: 0 }).toFloat(),
  query("maxPrice").optional().isFloat({ min: 0 }).toFloat(),
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 50 }).toInt(),
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

module.exports = { searchRules, handleValidation };
