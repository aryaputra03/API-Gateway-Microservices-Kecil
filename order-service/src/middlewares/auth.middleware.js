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
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    // Pastikan payload berisi userId (kita akan memakainya sebagai pemilik order)
    if (!payload.userId) {
      return res.status(401).json({
        success: false,
        message: "Token tidak valid",
        code: "TOKEN_INVALID",
      });
    }

    req.user = payload; // { userId, role, iat, exp }
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
