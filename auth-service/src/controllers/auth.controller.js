const bcrypt = require("bcrypt");
const supabase = require("../config/supabase");
const { signToken } = require("../utils/jwt.util");

const SALT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;
// Kolom aman yang boleh dikirim ke client (TANPA password_hash)
const PUBLIC_COLUMNS = "id, name, email, role, created_at";
// Hash palsu untuk menyamakan waktu respons saat email tidak ditemukan
const DUMMY_HASH = bcrypt.hashSync("dummy-password-untuk-timing", SALT_ROUNDS);

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // role TIDAK diambil dari body -> DB yang mengisi default 'customer'
    const { data, error } = await supabase
      .from("users")
      .insert({ name, email, password_hash: passwordHash })
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) {
      if (error.code === "23505") {
        // unique_violation (email sudah ada)
        return res.status(409).json({
          success: false,
          message: "Email sudah terdaftar",
          code: "EMAIL_ALREADY_EXISTS",
        });
      }
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: "Registrasi berhasil",
      data: { user: data },
    });
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, email, role, password_hash")
      .eq("email", email)
      .maybeSingle();

    if (error) throw error;

    // Selalu jalankan bcrypt.compare, walau user tidak ada
    const ok = await bcrypt.compare(
      password,
      user ? user.password_hash : DUMMY_HASH,
    );

    if (!user || !ok) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah",
        code: "INVALID_CREDENTIALS",
      });
    }

    const token = signToken({ userId: user.id, role: user.role });

    return res.status(200).json({
      success: true,
      message: "Login berhasil",
      data: {
        token,
        tokenType: "Bearer",
        expiresIn: process.env.JWT_EXPIRES_IN || "1h",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select(PUBLIC_COLUMNS)
      .eq("id", req.user.userId)
      .maybeSingle();

    if (error) throw error;

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User untuk token ini tidak ditemukan",
        code: "USER_NOT_FOUND",
      });
    }

    return res.status(200).json({
      success: true,
      data: { user, tokenPayload: req.user },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, me };
