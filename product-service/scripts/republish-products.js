require("dotenv").config();
const supabase = require("../src/config/supabase");

async function run() {
  const { data: products, error } = await supabase.from("products").select("*");
  if (error) throw error;

  const rows = products.map((p) => ({
    topic: "product.events",
    key: p.id,
    payload: {
      type: "product.created",
      updatedAt: p.updated_at,
      product: {
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        stock: p.stock,
      },
    },
  }));

  const { error: insertError } = await supabase
    .from("outbox_events")
    .insert(rows);
  if (insertError) throw insertError;

  console.log(
    `${rows.length} event product.created ditulis ke outbox. Relay akan menerbitkannya.`,
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
