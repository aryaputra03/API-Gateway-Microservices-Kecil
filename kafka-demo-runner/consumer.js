const { Kafka } = require("kafkajs");

const groupId = process.argv[2] || "demo-group-a"; // jalankan: node consumer.js demo-group-a
const kafka = new Kafka({
  clientId: `demo-consumer-${groupId}`,
  brokers: ["localhost:29092"],
});
const consumer = kafka.consumer({ groupId });

async function run() {
  await consumer.connect();
  await consumer.subscribe({ topic: "demo.hello", fromBeginning: true });

  console.log(`consumer siap. groupId=${groupId}`);

  await consumer.run({
    eachMessage: async ({ partition, message }) => {
      console.log(
        `[group=${groupId}] partisi=${partition} key=${message.key?.toString()} value=${message.value.toString()}`,
      );
    },
  });
}

run().catch(console.error);
