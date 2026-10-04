require("dotenv").config(); // HARUS paling atas, sebelum require lain yang membaca process.env

const app = require("./app");
const { getSecret } = require("./utils/jwt.util");

getSecret(); // fail-fast: berhenti sekarang kalau JWT_SECRET tidak valid

const PORT = process.env.PORT || 4001;

app.listen(PORT, () => {
  console.log(`auth-service berjalan di http://localhost:${PORT}`);
});
