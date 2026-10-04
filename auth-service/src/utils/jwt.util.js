const jwt = require("jsonwebtoken");

const ALGORITHM = "HS256";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET belum di-set atau terlalu pendek (minimal 32 karakter)",
    );
  }
  return secret;
}

// Satu-satunya tempat di seluruh sistem yang boleh MEMBUAT token
function signToken({ userId, role }) {
  return jwt.sign({ userId, role }, getSecret(), {
    algorithm: ALGORITHM,
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  });
}

function verifyToken(token) {
  // Daftar algoritma dikunci secara eksplisit
  return jwt.verify(token, getSecret(), { algorithms: [ALGORITHM] });
}

module.exports = { signToken, verifyToken, getSecret };
