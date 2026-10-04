const express = require("express");
const { register, login, me } = require("../controllers/auth.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const {
  registerRules,
  loginRules,
  handleValidation,
} = require("../middlewares/validator.middleware");

const router = express.Router();

router.post("/register", registerRules, handleValidation, register);
router.post("/login", loginRules, handleValidation, login);
router.get("/me", authenticate, me);

module.exports = router;
