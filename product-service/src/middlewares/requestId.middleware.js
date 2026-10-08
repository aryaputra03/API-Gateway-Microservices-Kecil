const crypto = require("crypto");

function requestId(req, res, next) {
  // Kalau Nginx atau service pemanggil sudah menyisipkan ID, pakai itu (supaya satu alur tetap satu ID)
  const incoming = req.headers["x-request-id"];
  req.requestId = (incoming && String(incoming).trim()) || crypto.randomUUID();

  // Dikembalikan ke client juga, berguna kalau ada komplain "request saya jam X gagal"
  res.setHeader("X-Request-Id", req.requestId);
  next();
}

module.exports = { requestId };
