-- =====================================================================
-- 001_baseline.sql — Baseline v1.0 (Fase 1-6)
-- Direkonstruksi dari kode aplikasi karena definisi asli tidak pernah
-- di-commit ke repo (Temuan Audit #4). VERIFIKASI terhadap project
-- Supabase asli sebelum dipakai untuk reproduksi dari nol.
-- =====================================================================

-- ---------- schema auth_service ----------
CREATE SCHEMA IF NOT EXISTS auth_service;

CREATE TABLE IF NOT EXISTS auth_service.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'customer',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- schema product ----------
CREATE SCHEMA IF NOT EXISTS product;

CREATE TABLE IF NOT EXISTS product.products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  price       numeric(12,2) NOT NULL,
  stock       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Dipakai oleh POST /internal/products/:id/reduce-stock.
-- Atomik: WHERE stock >= p_qty mencegah stok negatif di request paralel.
CREATE OR REPLACE FUNCTION product.reduce_stock(p_id uuid, p_qty int)
RETURNS TABLE(product_id uuid, new_stock int)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE product.products
     SET stock = stock - p_qty
   WHERE id = p_id AND stock >= p_qty
  RETURNING id, stock;
END;
$$;

-- ---------- schema "order" (quoted: reserved word di SQL) ----------
CREATE SCHEMA IF NOT EXISTS "order";

CREATE TABLE IF NOT EXISTS "order".orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  status         text NOT NULL DEFAULT 'created'
                 CHECK (status IN ('created', 'confirmed', 'failed')),
  failure_reason text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "order".order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES "order".orders(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL,
  quantity      integer NOT NULL CHECK (quantity > 0),
  price_at_time numeric(12,2) NOT NULL
);

-- Simpan order + item dalam SATU transaksi (atomik).
-- p_price = harga yang "dibekukan" saat order dibuat (lihat order.controller.js baris 120).
CREATE OR REPLACE FUNCTION "order".create_order(
  p_user_id uuid, p_product_id uuid, p_quantity int, p_price numeric
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_order_id uuid;
BEGIN
  INSERT INTO "order".orders (user_id, status)
    VALUES (p_user_id, 'created')
    RETURNING id INTO v_order_id;

  INSERT INTO "order".order_items (order_id, product_id, quantity, price_at_time)
    VALUES (v_order_id, p_product_id, p_quantity, p_price);

  RETURN v_order_id;
END;
$$;

-- ---------- Supabase: expose schema ke PostgREST ----------
-- Jika belum pernah di-set (biasanya hanya sekali di awal project):
-- Dashboard -> Project Settings -> Data API -> "Exposed schemas"
-- tambahkan: auth_service, product, order