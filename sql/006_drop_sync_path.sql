-- Jalur sync resmi dipensiunkan di Fase 12; create_order lama sudah tidak dipanggil siapa pun.
DROP FUNCTION IF EXISTS "order".create_order(uuid, uuid, int, numeric);