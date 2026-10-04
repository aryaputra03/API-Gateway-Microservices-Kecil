const { body, validationResult } = require("express-validator");

const registerRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Nama wajib diisi")
    .isLength({ max: 100 })
    .withMessage("Nama maksimal 100 karakter"),
  body("email")
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage("Format email tidak valid")
    .isLength({ max: 150 })
    .withMessage("Email maksimal 150 karakter"),
  body("password")
    .isString()
    .withMessage("Password harus berupa teks")
    .isLength({ min: 8, max: 72 })
    .withMessage("Password harus 8–72 karakter"),
];

const loginRules = [
  body("email")
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage("Format email tidak valid"),
  body("password")
    .isString()
    .withMessage("Password harus berupa teks")
    .notEmpty()
    .withMessage("Password wajib diisi"),
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

module.exports = { registerRules, loginRules, handleValidation };
