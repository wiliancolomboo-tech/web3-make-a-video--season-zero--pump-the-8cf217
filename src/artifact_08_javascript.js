const http = require("http");

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        status: "UP",
        timestamp: new Date().toISOString(),
        service: "season-zero-attestation-worker",
        solanaCluster: process.env.SOLANA_RPC_URL || "devnet",
        uptimeSeconds: Math.floor(process.uptime()),
      })
    );
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`[HealthCheck] Season Zero Daemon listening on port ${PORT}`);
});