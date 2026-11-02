// src/health.ts
import http from 'http';

const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'HEALTHY',
            uptime: process.uptime(),
            service: 'SolQuest Dynamic Video Engine',
            solanaTarget: 'mainnet-beta',
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(8080, () => {
    console.log('[Health] Telemetry daemon listening on port 8080');
});