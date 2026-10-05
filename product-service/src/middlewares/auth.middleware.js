const jwt = require("jsonwebtoken");

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return res.status(401).json({
      success: false,
      message:
        "Token tidak ditemukan. Gunakan header Authorization: Bearer <token>",
      code: "TOKEN_MISSING",
    });
  }

  try {
    // Hanya VERIFY. Tidak ada jwt.sign di service ini, dan tidak ada call ke auth-service.
    req.user = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    return next();
  } catch (err) {
    const expired = err.name === "TokenExpiredError";
    return res.status(401).json({
      success: false,
      message: expired ? "Token sudah kedaluwarsa" : "Token tidak valid",
      code: expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
    });
  }
}

module.exports = { authenticate };
