-- status baru; sesuaikan jika tabelmu tidak memakai CHECK constraint
ALTER TABLE "order".orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE "order".orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('created','pending','confirmed','rejected','failed'));
ALTER TABLE "order".order_items ALTER COLUMN price_at_time DROP NOT NULL;

CREATE TABLE "order".outbox_events (
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
   topic text NOT NULL,
   key text NOT NULL,
   payload jsonb NOT NULL,
   headers jsonb NOT NULL DEFAULT '{}',
   created_at timestamptz NOT NULL DEFAULT now(),
   published_at timestamptz
);
CREATE INDEX ON "order".outbox_events (created_at) WHERE published_at IS NULL;

CREATE OR REPLACE FUNCTION "order".create_order_event(
  p_user_id uuid, p_product_id uuid, p_quantity int, p_request_id text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_order_id uuid;
BEGIN
  INSERT INTO "order".orders (user_id, status) VALUES (p_user_id, 'pending')
    RETURNING id INTO v_order_id;
  INSERT INTO "order".order_items (order_id, product_id, quantity)
    VALUES (v_order_id, p_product_id, p_quantity);
  INSERT INTO "order".outbox_events (topic, key, payload, headers)
  VALUES ('order.created', v_order_id::text,
    jsonb_build_object('orderId', v_order_id, 'userId', p_user_id,
                       'productId', p_product_id, 'quantity', p_quantity),
    jsonb_build_object('x-request-id', p_request_id));
  RETURN v_order_id;
END $$;

-- hasil dari product-service; aman dipanggil berulang (idempotent)
CREATE OR REPLACE FUNCTION "order".apply_stock_result(
  p_order_id uuid, p_result text, p_unit_price numeric, p_reason text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_result = 'reserved' THEN
    UPDATE "order".orders SET status = 'confirmed', failure_reason = NULL
      WHERE id = p_order_id AND (status = 'pending'
         OR (status = 'failed' AND failure_reason LIKE 'PENDING_TIMEOUT%'));
    IF FOUND THEN
       UPDATE "order".order_items SET price_at_time = p_unit_price WHERE order_id = p_order_id;
    END IF;
  ELSE
    UPDATE "order".orders SET status = 'rejected', failure_reason = p_reason
     WHERE id = p_order_id AND status = 'pending';
  END IF;
END $$;