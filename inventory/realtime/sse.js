'use strict';

/**
 * Minimal SSE hub for live inventory updates across LAN computers. Mirrors the
 * pattern already used by the order stream in server.js. Phase 1 broadcasts
 * balance changes and new alerts; later phases reuse the same channel.
 */

const clients = new Set();

function handler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  clients.add(res);

  const keepAlive = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch (_) { /* noop */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch (_) { clients.delete(res); }
  }
}

function clientCount() {
  return clients.size;
}

module.exports = { handler, broadcast, clientCount };
