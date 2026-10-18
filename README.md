# API Gateway + Microservices Kecil (v2 — Event-Driven)

Project belajar backend engineering: dimulai dari API Gateway + 3 microservice sinkron (v1.0),
lalu diupgrade jadi arsitektur event-driven dengan Apache Kafka (outbox pattern, idempotency,
DLQ) dan pencarian full-text dengan Elasticsearch (v2.0).

## Daftar Isi

- [Arsitektur](#arsitektur)
- [Struktur Repo](#struktur-repo)
- [Menjalankan dari Nol](#menjalankan-dari-nol)
- [Endpoint](#endpoint)
- [Katalog Event Kafka](#katalog-event-kafka)
- [Environment Variables](#environment-variables)
- [Desain Reliabilitas](#desain-reliabilitas)
- [Hasil Uji Skenario Kegagalan](#hasil-uji-skenario-kegagalan)

---

## Arsitektur

```
                            ┌─────────────────┐
                 ┌─────────▶│  auth-service    │
                 │          │  :4001           │
                 │          └─────────────────┘
                 │
Client ──▶ Nginx │          ┌─────────────────┐
 Gateway   :80   ├─────────▶│ product-service  │◀──┐
                 │          │  :4002 (x2)      │   │
                 │          └────────┬────────┘   │
                 │                   │             │ Kafka
                 │          ┌────────▼────────┐   │ (outbox
                 ├─────────▶│  order-service   │───┘  pattern)
                 │          │  :4004           │
                 │          └────────┬────────┘
                 │                   │
                 │          ┌────────▼────────┐    ┌───────────────┐
                 └─────────▶│  search-service  │◀───│ Elasticsearch │
                            │  :4005           │    │  (internal)   │
                            └─────────────────┘    └───────────────┘

Semua service privat — hanya terjangkau lewat jaringan internal Docker Compose.
Satu-satunya pintu masuk dari luar adalah Nginx Gateway di port 80.
```

**Alur order (event-driven, sejak Fase 9):**

1. Client `POST /api/orders` → order-service langsung menyimpan order (status `pending`) +
   menulis event ke tabel `outbox_events` miliknya sendiri, dalam **satu transaksi** di Postgres.
   Balasan **202** langsung diberikan — tidak ada panggilan HTTP ke product-service sama sekali.
2. Relay outbox order-service membaca baris outbox yang belum terkirim, menerbitkannya ke topic
   Kafka `order.created`, lalu menandainya terkirim.
3. product-service (berjalan di 2 instance, `product-1` dan `product-2`, dalam satu consumer
   group) mengonsumsi `order.created`, mengurangi stok secara atomik, lalu menulis hasilnya
   (`stock.reserved` atau `stock.rejected`) ke outbox miliknya sendiri.
4. order-service mengonsumsi hasil itu, memperbarui status order jadi `confirmed` atau `rejected`.
5. Setiap perubahan pada tabel produk (termasuk pengurangan stok di langkah 3) memicu trigger
   Postgres yang menulis event ke topic `product.events`, dikonsumsi oleh search-service untuk
   menjaga index Elasticsearch tetap sinkron.

Pola **outbox + consumer idempotent** ini sengaja dipakai supaya sistem tahan terhadap Kafka mati,
service mati di tengah proses, pesan duplikat, dan pesan rusak — lihat [Desain
Reliabilitas](#desain-reliabilitas).

## Struktur Repo

```
microservices-project/
├── auth-service/        # registrasi, login, penerbit JWT
├── product-service/     # CRUD produk, konsumsi order.created, index Elasticsearch (via event)
├── order-service/       # buat & lihat order, konsumsi stock.reserved/rejected
├── search-service/      # GET /search/products, konsumsi product.events
├── gateway/              # konfigurasi Nginx (nginx.conf manual, nginx.docker.conf untuk Compose)
├── sql/                  # migrasi SQL berurutan, 001 s.d. 006
└── docker-compose.yml
```

## Menjalankan dari Nol

1. Salin tiap `*/.env.example` jadi `*/.env`, isi `SUPABASE_URL` dan
   `SUPABASE_SERVICE_ROLE_KEY` (dari project Supabase kamu sendiri), dan `JWT_SECRET`
   (string acak minimal 32 karakter, **harus identik** di `auth-service`, `product-service`,
   `order-service`).
2. `docker compose up -d` — tunggu semua container `healthy` (`docker compose ps`).
3. Jalankan `sql/001_baseline.sql` sampai `sql/006_drop_sync_path.sql` **berurutan** di Supabase
   SQL Editor.
4. `docker compose exec product-1 node scripts/republish-products.js` — isi index Elasticsearch
   dari produk yang sudah ada (kalau ada).
5. `POST /api/auth/register` untuk buat akun, lalu jalankan manual di Supabase:
   `UPDATE auth_service.users SET role='admin' WHERE email='...'` untuk akun yang mau dipakai
   sebagai admin (role tidak bisa diset lewat API, sengaja).
6. Coba lewat Postman atau PowerShell sesuai tabel endpoint di bawah.

## Endpoint

Semua lewat gateway: `http://localhost/api/...`

| Method | Path                   | Auth  | Keterangan                                                               |
| ------ | ---------------------- | ----- | ------------------------------------------------------------------------ |
| POST   | `/api/auth/register`   | -     | Daftar akun baru (role selalu `customer`)                                |
| POST   | `/api/auth/login`      | -     | Dapat JWT (berlaku 1 jam)                                                |
| GET    | `/api/products`        | -     | List produk, paginated                                                   |
| GET    | `/api/products/:id`    | -     | Detail satu produk                                                       |
| POST   | `/api/products`        | admin | Buat produk                                                              |
| PUT    | `/api/products/:id`    | admin | Ubah produk                                                              |
| DELETE | `/api/products/:id`    | admin | Hapus produk                                                             |
| POST   | `/api/orders`          | user  | **202** — `{orderId, status:"pending"}`, diproses async                  |
| GET    | `/api/orders`          | user  | List order milik user yang login                                         |
| GET    | `/api/orders/:id`      | user  | Detail order (404 kalau bukan milik sendiri — anti-IDOR)                 |
| GET    | `/api/search/products` | -     | Full-text search: `q`, `minPrice`, `maxPrice`, `page`, `limit` (maks 50) |

## Katalog Event Kafka

| Topic                                  | Diterbitkan oleh                                                           | Dikonsumsi oleh                                             | Payload inti                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `order.created`                        | order-service (via outbox relay)                                           | product-service (`product-1`/`product-2`, 1 consumer group) | `orderId`, `productId`, `quantity`                                                                      |
| `stock.reserved`                       | product-service (via outbox relay, hanya `product-1`)                      | order-service                                               | `orderId`, `unitPrice`, `newStock`                                                                      |
| `stock.rejected`                       | product-service (via outbox relay, hanya `product-1`)                      | order-service                                               | `orderId`, `reason`                                                                                     |
| `product.events`                       | product-service (trigger Postgres pada setiap INSERT/UPDATE/DELETE produk) | search-service                                              | `type` (`product.created`/`updated`/`deleted`), `updatedAt`, `product{id,name,description,price,stock}` |
| `<topic>.dlq` (satu per topic di atas) | consumer yang gagal memproses setelah 3x percobaan                         | — (inspeksi manual via kafka-ui)                            | Pesan asli + header `error`, `attempts`, `origin`                                                       |

Setiap pesan dibungkus _envelope_ yang sama: `{eventId, type, version, occurredAt, requestId, payload}`.
`requestId` diteruskan dari `X-Request-Id` gateway sampai ke consumer paling ujung, sehingga satu
request bisa ditelusuri lintas semua service lewat `grep`/`Select-String` pada log (formatnya
seragam: `<timestamp ISO> [<requestId>] <event> <id> -> <hasil>`).

## Environment Variables

| Service         | Variabel                                                                                                          | Keterangan                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| auth-service    | `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DB_SCHEMA`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS` | —                                                                |
| product-service | di atas + `KAFKA_BROKERS`, `OUTBOX_RELAY_ENABLED`, `OUTBOX_POLL_MS`, `OUTBOX_RETENTION_DAYS`                      | Relay & cleanup outbox aktif hanya di `product-1`                |
| order-service   | di atas (tanpa `OUTBOX_RELAY_ENABLED`) + `PENDING_TIMEOUT_MS`                                                     | Relay & cleanup selalu aktif (cuma 1 instance)                   |
| search-service  | `PORT`, `KAFKA_BROKERS`, `ELASTICSEARCH_URL`                                                                      | Tanpa variabel `SUPABASE_*` — tidak pernah mengakses database    |
| docker-compose  | tag image `nginx`, `apache/kafka`, `elasticsearch`, `kafka-ui`                                                    | Semua di-pin ke versi spesifik, tidak pernah `:latest`/`:stable` |

`.env.example` lengkap tersedia di tiap folder service — **tidak ada secret asli yang
ter-commit**, `.env` sungguhan selalu di-`.gitignore`.

## Desain Reliabilitas

- **Outbox pattern** — penulisan data dan "niat mengirim event" terjadi dalam satu transaksi
  database, menghindari kondisi "data tersimpan tapi event hilang" atau sebaliknya.
- **Idempotency** — setiap consumer mencatat `eventId` yang sudah diproses (`processed_events`)
  sebelum mengubah apa pun, sehingga pesan yang terkirim dua kali (termasuk akibat outbox relay
  yang crash tepat setelah publish, sebelum sempat menandai) tidak menghasilkan efek ganda.
- **Retry + DLQ** — pesan yang gagal diproses dicoba ulang dengan backoff sampai 3x; kalau tetap
  gagal (atau memang pesan rusak), dikirim ke topic `.dlq` miliknya sendiri supaya partisi tidak
  macet dan pesan-pesan berikutnya tetap diproses.
- **Resilient startup** — semua koneksi ke Kafka dan Elasticsearch memakai retry dengan backoff
  eksponensial saat startup maupun saat terputus di tengah jalan; service inti (HTTP API) tidak
  pernah crash hanya karena salah satu dependency belum siap.
- **Pending timeout** — order yang macet di status `pending` terlalu lama (misal product-service
  down lama) otomatis ditandai `failed`, tapi tetap bisa "dihidupkan kembali" jadi `confirmed`
  kalau hasilnya ternyata datang belakangan.
- **Graceful shutdown** — saat menerima `SIGTERM`, consumer dan producer Kafka diputus dengan
  rapi sebelum HTTP server ditutup, mencegah pesan setengah diproses saat container di-restart.

## Hasil Uji Skenario Kegagalan

> Diisi dari hasil pengujian nyata — tanggal, output asli, dan screenshot kafka-ui bila relevan.

| #   | Skenario                               | Cara memicu                                                          | Hasil yang diharapkan                                                        | Tanggal diuji | Hasil aktual |
| --- | -------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------- | ------------ |
| 1   | product-service mati saat order dibuat | Matikan `product-1`+`product-2`, `POST /orders`, nyalakan lagi       | 202 + pending → confirmed otomatis                                           |               |              |
| 2   | Pesan duplikat                         | Terbitkan ulang `order.created` dengan `eventId` sama                | `duplicate`, stok terpotong sekali                                           |               |              |
| 3   | Race stok terakhir                     | 10 order paralel untuk stok awal 5                                   | Tepat 5 confirmed, 5 rejected, stok tidak negatif                            |               |              |
| 4   | Kafka mati                             | Hentikan container `kafka`, buat order                               | Tetap 202; event terkirim setelah Kafka hidup                                |               |              |
| 5   | Relay crash setelah publish            | Hentikan service tepat setelah kirim, sebelum tandai                 | Event terkirim dua kali, hasil akhir tetap benar                             |               |              |
| 6   | Pesan rusak                            | Produce teks bukan JSON ke `order.created`                           | Masuk `order.created.dlq`, pesan lain tetap diproses                         |               |              |
| 7   | Error DB terus-menerus di consumer     | Simulasikan kegagalan RPC sementara                                  | Retry sampai batas lalu DLQ; partisi tidak macet                             |               |              |
| 8   | Rebalance consumer                     | Matikan `product-1` saat order masuk                                 | `product-2` mengambil alih partisi; order tetap diproses                     |               |              |
| 9   | Pending timeout & hasil terlambat      | Matikan product-service melewati `PENDING_TIMEOUT_MS`, nyalakan lagi | `failed` (`PENDING_TIMEOUT`) lalu jadi `confirmed`                           |               |              |
| 10  | Elasticsearch mati                     | Hentikan container `elasticsearch`, ubah produk                      | CRUD normal; index mengejar setelah hidup lagi                               |               |              |
| 11  | Event produk usang                     | Terbitkan `product.updated` dengan `updatedAt` lama                  | Diabaikan (konflik versi); dokumen tetap yang terbaru                        |               |              |
| 12  | Penelusuran request                    | Ambil `X-Request-Id` dari respons, cari di semua log                 | Muncul di gateway, order, product (consumer), order (consumer hasil), search |               |              |
