CREATE TABLE product.outbox_events (
   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
   topic text NOT NULL, key text NOT NULL, payload jsonb NOT NULL,
   headers jsonb NOT NULL DEFAULT '{}',
   created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz
);
CREATE INDEX ON product.outbox_events (created_at) WHERE published_at IS NULL;

CREATE TABLE product.processed_events (
   event_id uuid PRIMARY KEY, topic text NOT NULL,
   processed_at timestamptz NOT NULL DEFAULT now()
);

-- penanda idempotency + potong stok + tulis outbox: SATU transaksi
CREATE OR REPLACE FUNCTION product.reserve_stock_for_order(
  p_event_id uuid, p_order_id uuid, p_product_id uuid, p_qty int, p_request_id text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_price numeric; v_stock int; v_n int; v_hdr jsonb;
BEGIN
  v_hdr := jsonb_build_object('x-request-id', p_request_id);
  INSERT INTO product.processed_events (event_id, topic)
    VALUES (p_event_id, 'order.created') ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN 'duplicate'; END IF;

  UPDATE product.products SET stock = stock - p_qty
   WHERE id = p_product_id AND stock >= p_qty
   RETURNING price, stock INTO v_price, v_stock;

  IF FOUND THEN
    INSERT INTO product.outbox_events (topic, key, payload, headers)
    VALUES ('stock.reserved', p_order_id::text,
      jsonb_build_object('orderId', p_order_id, 'productId', p_product_id,
                         'quantity', p_qty, 'unitPrice', v_price, 'newStock', v_stock), v_hdr);
    RETURN 'reserved';
  END IF;

  INSERT INTO product.outbox_events (topic, key, payload, headers)
  VALUES ('stock.rejected', p_order_id::text,
    jsonb_build_object('orderId', p_order_id, 'productId', p_product_id,
      'reason', CASE WHEN EXISTS (SELECT 1 FROM product.products WHERE id = p_product_id)
                     THEN 'INSUFFICIENT_STOCK' ELSE 'PRODUCT_NOT_FOUND' END), v_hdr);
  RETURN 'rejected';
END $$;