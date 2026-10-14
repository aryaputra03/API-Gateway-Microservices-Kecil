const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "demo-producer",
  brokers: ["localhost:29092"],
});
const producer = kafka.producer();

async function run() {
  await producer.connect();

  // Key sengaja cuma 4 variasi, supaya pembagian ke 3 partisi gampang diamati
  const keys = ["user-1", "user-2", "user-3", "user-4"];

  for (let i = 1; i <= 20; i++) {
    const key = keys[i % keys.length];
    await producer.send({
      topic: "demo.hello",
      messages: [{ key, value: `pesan ke-${i} dari key ${key}` }],
    });
    console.log(`terkirim #${i} (key=${key})`);
    await new Promise((r) => setTimeout(r, 300)); // jeda kecil biar gampang diamati satu-satu
  }

  await producer.disconnect();
  console.log("selesai, producer disconnect.");
}

run().catch(console.error);
