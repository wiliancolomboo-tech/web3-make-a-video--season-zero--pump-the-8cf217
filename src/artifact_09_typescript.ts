import fastify from "fastify";
import { Connection } from "@solana/web3.js";

const server = fastify({ logger: true });
const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com");

server.get("/health", async (request, reply) => {
  try {
    const slot = await connection.getSlot();
    return reply.status(200).send({
      status: "healthy",
      solanaSlot: slot,
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  } catch (error: any) {
    return reply.status(503).send({ status: "unhealthy", error: error.message });
  }
});

server.listen({ port: 3000, host: "0.0.0.0" });