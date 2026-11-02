const http = require('http');
const port = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'UP',
      service: 'season-zero-pump-the-pool-3-engine',
      timestamp: new Date().toISOString(),
      oracleSignerActive: Boolean(process.env.ORACLE_SECRET_KEY),
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(port, () => {
  console.log(`Telemetry endpoint listening on port ${port}`);
});