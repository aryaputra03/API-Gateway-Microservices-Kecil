# API Gateway + Microservices Kecil

Sistem belajar arsitektur microservices: 3 service mandiri (auth, product, order), masing-masing dengan database/schema sendiri di Supabase, disatukan di belakang API Gateway (Nginx) dengan load balancing dan rate limiting.

## Arsitektur

```
                              ┌──────────────────┐
                 ┌───────────▶│  auth-service     │  (4001)
                 │            │  schema: auth_service
   Client        │            └──────────────────┘
     │           │
     ▼           │            ┌──────────────────┐
┌─────────┐      ├───────────▶│ product-service   │  x2 instance (4002, 4003)
│  Nginx  │──────┤            │  schema: product   │  round-robin + failover
│ gateway │      │            └─────────┬────────┘
│ (:80)   │      │                      ▲
└─────────┘      │                      │ HTTP (verifikasi JWT sendiri,
                 │            ┌─────────┴────────┐  tanpa panggil auth-service)
                 └───────────▶│  order-service     │  (4004)
                              │  schema: "order"    │
                              └──────────────────┘
```

Setiap service punya schema database sendiri dan **tidak pernah mengakses tabel service lain secara langsung**. Komunikasi antar service murni lewat HTTP, dengan JWT (dibuat auth-service, diverifikasi mandiri oleh product-service dan order-service) sebagai satu-satunya "bahasa" bersama.

Request ID (`X-Request-Id`) mengalir dari client → gateway → order-service → product-service dan tercatat di log ketiga service, sehingga satu alur request bisa ditelusuri lintas service lewat satu ID yang sama.

## Menjalankan Sistem

### Opsi A — Manual (untuk development)

Prasyarat: Node.js 22+, akun Supabase dengan tiga schema (`auth_service`, `product`, `"order"`) sudah dibuat.

Untuk tiap folder `auth-service/`, `product-service/`, `order-service/`:

```bash
cp .env.example .env     # isi SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
                          # JWT_SECRET WAJIB SAMA PERSIS di ketiga .env
npm install
npm run dev
```

Jalankan instance kedua product-service (opsional, untuk menguji load balancing):

```powershell
cd product-service
$env:PORT = "4003"; npm run dev     # PowerShell
```

```bash
cd product-service
PORT=4003 npm run dev               # bash / Git Bash
```

Jalankan gateway (Windows, Nginx diekstrak ke `C:\nginx`):

```powershell
cd C:\nginx
.\nginx.exe -p C:\nginx -c "<path-repo>\gateway\nginx.conf"
```

Sistem siap diakses di `http://localhost`.

### Opsi B — Docker Compose (satu perintah)

```bash
docker compose up --build -d
docker compose ps        # pastikan semua service berstatus "healthy"
```

Menyalakan 5 container: `auth-service`, 2 instance `product-service` (`product-1`, `product-2`), `order-service`, dan `gateway`. Hanya port 80 yang terbuka ke host; service lain terisolasi di jaringan internal Docker.

```bash
docker compose logs -f gateway     # lihat log gabungan termasuk upstream mana yang melayani
docker compose down                # hentikan dan hapus container
```

## Environment Variables

| Variabel                      | Dipakai di     | Keterangan                                                                                                             |
| ----------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `PORT`                        | ketiga service | Port HTTP service. Di Docker Compose ditimpa lewat `environment:`                                                      |
| `SUPABASE_URL`                | ketiga service | URL project Supabase                                                                                                   |
| `SUPABASE_SERVICE_ROLE_KEY`   | ketiga service | Key dengan akses penuh, bypass RLS. **Jangan pernah dipakai di frontend**                                              |
| `DB_SCHEMA`                   | ketiga service | Schema khusus tiap service: `auth_service`, `product`, `order`                                                         |
| `JWT_SECRET`                  | ketiga service | **Harus identik** di ketiga `.env` — ini "perekat" yang membuat token lintas service bisa diverifikasi                 |
| `JWT_EXPIRES_IN`              | auth-service   | Masa berlaku token, default `1h`                                                                                       |
| `BCRYPT_ROUNDS`               | auth-service   | Cost factor hashing password, default `10`                                                                             |
| `PRODUCT_SERVICE_URL`         | order-service  | Alamat product-service (langsung atau lewat listener internal Nginx)                                                   |
| `PRODUCT_SERVICE_TIMEOUT_MS`  | order-service  | Batas waktu tunggu panggilan ke product-service, default `3000`                                                        |
| `TEST_DELAY_BEFORE_REDUCE_MS` | order-service  | **Khusus pengujian** — jeda sebelum kurangi stok, untuk memicu skenario kegagalan. Biarkan `0` untuk penggunaan normal |

## Daftar Endpoint (lewat gateway, `http://localhost/api`)

### auth-service — `/api/auth`

| Method | Path        | Auth   | Keterangan                                  |
| ------ | ----------- | ------ | ------------------------------------------- |
| POST   | `/register` | -      | Daftar user baru, `role` default `customer` |
| POST   | `/login`    | -      | Mengembalikan JWT (`exp` 1 jam)             |
| GET    | `/me`       | Bearer | Data user pemilik token                     |

### product-service — `/api/products`

| Method | Path   | Auth   | Keterangan                                                      |
| ------ | ------ | ------ | --------------------------------------------------------------- |
| GET    | `/`    | -      | List produk, dukung `?page&limit`                               |
| GET    | `/:id` | -      | Detail satu produk                                              |
| POST   | `/`    | Bearer | Buat produk                                                     |
| PUT    | `/:id` | Bearer | Update sebagian field (`name`, `description`, `price`, `stock`) |
| DELETE | `/:id` | Bearer | Hapus produk                                                    |

Endpoint `/internal/products/:id/stock` dan `/internal/products/:id/reduce-stock` **hanya** dipakai order-service secara internal, sengaja tidak diekspos lewat gateway.

### order-service — `/api/orders`

| Method | Path   | Auth   | Keterangan                                                                                  |
| ------ | ------ | ------ | ------------------------------------------------------------------------------------------- |
| POST   | `/`    | Bearer | Buat order (`productId`, `quantity`). Memanggil product-service untuk cek lalu kurangi stok |
| GET    | `/`    | Bearer | Riwayat order milik user yang login                                                         |
| GET    | `/:id` | Bearer | Detail satu order, hanya milik sendiri                                                      |

Format response selalu `{ success, message?, data?, code? }`. Error tidak pernah membocorkan stack trace ke client; detail lengkap hanya tercatat di log server.

## Skenario Kegagalan yang Sudah Diuji

| #   | Skenario                                                       | Cara memicu                                                                | Hasil yang diharapkan                                                                                                                   |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | product-service mati total sebelum order dibuat                | Matikan semua instance, lalu `POST /orders`                                | `503 PRODUCT_SERVICE_UNAVAILABLE`, order **tidak** tersimpan, respons < 1 detik, tidak hang                                             |
| 2   | product-service mati setelah stok dicek tapi sebelum dikurangi | Set `TEST_DELAY_BEFORE_REDUCE_MS`, matikan service di tengah jeda          | Order tersimpan dengan `status: failed`, kolom `failure_reason` terisi                                                                  |
| 3   | product-service lambat (timeout)                               | `PRODUCT_SERVICE_TIMEOUT_MS=1`, atau arahkan ke alamat yang tidak membalas | `504 PRODUCT_SERVICE_TIMEOUT`, tidak menggantung selamanya                                                                              |
| 4   | Satu instance product-service mati (dari 2)                    | `docker compose stop product-2`, atau matikan salah satu terminal          | Semua request client tetap `200`; Nginx otomatis pindah ke instance sehat (`proxy_next_upstream`)                                       |
| 5   | Load balancing                                                 | 10 request berturut ke `GET /api/products`, bandingkan log kedua instance  | Terbagi kira-kira 5/5 (round-robin)                                                                                                     |
| 6   | Rate limit terlampaui                                          | Kirim lebih dari ~30 request/detik dari satu client                        | Sebagian ditolak `429 RATE_LIMITED`, service tidak crash, request yang lolos tetap normal                                               |
| 7   | Dua request bersamaan merebut stok terakhir                    | 10 request paralel mengurangi stok dari stok awal 5                        | Tepat 5x `200` dan 5x `409`, stok akhir tidak pernah negatif (atomik di level database)                                                 |
| 8   | Header `Authorization` dihapus dari Nginx (sengaja)            | Comment baris `proxy_set_header Authorization` lalu reload                 | Request yang butuh token mulai gagal `401` walau client sudah mengirim token — membuktikan Nginx menentukan header mana yang diteruskan |
| 9   | ID bukan UUID yang valid                                       | `GET /api/products/abc`                                                    | `400 VALIDATION_ERROR`, bukan `500`                                                                                                     |
| 10  | Mengakses order milik orang lain                               | Ganti `:id` di `GET /api/orders/:id` dengan order milik user lain          | `404 ORDER_NOT_FOUND` (bukan `403`, untuk mencegah _user enumeration_ / IDOR)                                                           |

## Penelusuran Request Lintas Service

Setiap request mendapat `X-Request-Id` (dikirim client, atau dibuat otomatis oleh Nginx bila belum ada) dan tercatat di log ketiga service dengan format:

```
2026-10-07T07:15:32.120Z [a1b2c3d4-...] POST /orders 201 842 ms
```

Untuk menelusuri satu order yang gagal: ambil nilai header `X-Request-Id` dari response, lalu cari ID itu di log gateway, order-service, dan product-service. Urutan baris yang ditemukan menunjukkan persis di langkah mana kegagalan terjadi.

## Keputusan Desain & Batasan yang Disadari

- **Satu order = satu produk.** Order multi-item membutuhkan _compensating transaction_ (saga) untuk membatalkan item yang sudah terpotong stoknya jika item lain gagal — di luar scope project ini.
- **Nama schema disesuaikan** menjadi `auth_service`, `product`, dan `"order"` (dengan tanda kutip) karena `auth` sudah dipakai Supabase Auth bawaan, dan `order` adalah reserved word SQL.
- **Retry hanya untuk error koneksi yang jelas belum sampai ke server**, dan retry untuk timeout hanya diaktifkan pada operasi baca (`getStock`), tidak pada operasi tulis (`reduceStock`) — karena timeout pada operasi tulis berarti hasilnya ambigu (bisa jadi stok sudah terpotong, hanya balasannya yang tidak sampai).
- **Tidak ada idempotency key.** Pada kombinasi retry/failover yang sangat spesifik, ada risiko teoretis stok terpotong dua kali untuk satu order jika request pertama sebenarnya sukses tapi balasannya hilang. Mitigasi penuh membutuhkan idempotency key per request, di luar scope project ini.
- **JWT stateless, tanpa mekanisme pencabutan token.** Token yang sudah terbit tetap valid sampai `exp`, walau akun pemiliknya diblokir sekalipun.

## Struktur Repo

```
.
├── auth-service/
├── product-service/
├── order-service/
├── gateway/
│   ├── nginx.conf           # mode manual (native)
│   └── nginx.docker.conf    # mode Docker Compose
└── docker-compose.yml
```

## Pengujian Cepat (Postman / PowerShell)

1. `POST /api/auth/register` lalu `POST /api/auth/login` → simpan `token` dari response.
2. `POST /api/products` dengan header `Authorization: Bearer <token>` → simpan `id` produk.
3. `POST /api/orders` dengan body `{ "productId": "<id>", "quantity": 1 }`.
4. `GET /api/orders` untuk melihat riwayat order milik sendiri.

Detail skrip pengujian untuk tiap skenario kegagalan di atas (termasuk versi PowerShell-nya) ada di catatan pengembangan masing-masing fase pada riwayat project.
