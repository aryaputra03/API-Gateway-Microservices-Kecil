const { body, param, query, validationResult } = require("express-validator");

const idParam = [
  param("id").isUUID().withMessage("ID produk harus berupa UUID"),
];

const listQuery = [
  query("page").optional().isInt({ min: 1 }).withMessage("page minimal 1"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit harus 1–100"),
];

const createRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Nama produk wajib diisi")
    .isLength({ max: 150 })
    .withMessage("Nama maksimal 150 karakter"),
  body("description")
    .optional({ nullable: true })
    .isString()
    .withMessage("Deskripsi harus berupa teks"),
  body("price")
    .isFloat({ min: 0, max: 9999999999.99 })
    .withMessage("Harga harus angka >= 0")
    .toFloat(),
  body("stock")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Stok harus bilangan bulat >= 0")
    .toInt(),
];

// Semua field opsional (update parsial), tapi minimal satu dicek di controller
const updateRules = [
  ...idParam,
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Nama tidak boleh kosong")
    .isLength({ max: 150 })
    .withMessage("Nama maksimal 150 karakter"),
  body("description")
    .optional({ nullable: true })
    .isString()
    .withMessage("Deskripsi harus berupa teks"),
  body("price")
    .optional()
    .isFloat({ min: 0, max: 9999999999.99 })
    .withMessage("Harga harus angka >= 0")
    .toFloat(),
  body("stock")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Stok harus bilangan bulat >= 0")
    .toInt(),
];

const reduceStockRules = [
  ...idParam,
  body("quantity")
    .isInt({ min: 1 })
    .withMessage("quantity harus bilangan bulat >= 1")
    .toInt(),
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

module.exports = {
  idParam,
  listQuery,
  createRules,
  updateRules,
  reduceStockRules,
  handleValidation,
};
