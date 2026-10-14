// Dipasang SETELAH authenticate, supaya req.user sudah terisi dari JWT
function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Akses ditolak. Butuh role: ${allowedRoles.join(" atau ")}`,
        code: "FORBIDDEN",
      });
    }
    return next();
  };
}

module.exports = { requireRole };
