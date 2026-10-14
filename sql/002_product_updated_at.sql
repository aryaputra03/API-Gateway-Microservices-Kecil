ALTER TABLE product.products
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION product.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON product.products
FOR EACH ROW EXECUTE FUNCTION product.set_updated_at();