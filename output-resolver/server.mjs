// Self-hosted entry point, and the way to run the resolver locally.
//
//   CEEBLUE_USERNAME=... CEEBLUE_PASSWORD=... node server.mjs
//
// Plain node:http, no framework. Put it behind nginx or a load balancer for
// TLS, and set TRUST_FORWARDED_FOR=true so the viewer's real address survives.

import { createServer } from 'node:http';
import { handleRequest, readConfig } from './resolver.mjs';

const PORT = Number(process.env.PORT) || 8100;

// Your own machine has a private address, so the API cannot geo-locate it and
// falls back to a default edge. Set this to a public address to check that edge
// selection actually varies by region.
const VIEWER_IP = process.env.VIEWER_IP;

const config = readConfig(process.env);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const started = Date.now();
  let result;

  try {
    result = await handleRequest({
      method: req.method,
      query: Object.fromEntries(url.searchParams),
      headers: req.headers,
      sourceIp: VIEWER_IP || req.socket.remoteAddress
    }, config);
  } catch (error) {
    console.error(error);
    result = { status: 500, headers: { 'content-type': 'application/json' }, body: '{"error":"handler-threw"}' };
  }

  console.log(`${req.method} ${url.pathname}${url.search} -> ${result.status} (${Date.now() - started}ms)`);
  res.writeHead(result.status, result.headers);
  res.end(result.body || '');
});

server.listen(PORT, () => {
  if (!config.username || !config.password) {
    console.warn('CEEBLUE_USERNAME / CEEBLUE_PASSWORD are not set: every request will return 500');
  }
  console.log(`output resolver listening on http://localhost:${PORT}`);
  console.log(`  curl 'http://localhost:${PORT}/?stream=<streamId>'`);
});
