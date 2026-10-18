CREATE OR REPLACE FUNCTION product.enqueue_product_event() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE r record; t text;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; t := 'product.deleted';
  ELSIF TG_OP = 'INSERT' THEN r := NEW; t := 'product.created';
  ELSE r := NEW; t := 'product.updated'; END IF;

  INSERT INTO product.outbox_events (topic, key, payload)
  VALUES ('product.events', r.id::text, jsonb_build_object(
    'type', t,
    'updatedAt', CASE WHEN TG_OP = 'DELETE' THEN now() ELSE r.updated_at END,
    'product', jsonb_build_object('id', r.id, 'name', r.name, 'description', r.description,
                                  'price', r.price, 'stock', r.stock)));
  RETURN NULL;
END $$;

CREATE TRIGGER trg_products_outbox AFTER INSERT OR UPDATE OR DELETE ON product.products
FOR EACH ROW EXECUTE FUNCTION product.enqueue_product_event();