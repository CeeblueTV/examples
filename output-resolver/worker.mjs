// Cloudflare Workers entry point.
//
//   npx wrangler secret put CEEBLUE_PASSWORD
//   npx wrangler deploy
//
// Config comes from the `env` binding, not process.env, so it is read per
// request rather than at module load.

import { handleRequest, readConfig } from './resolver.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CF-Connecting-IP is the real client address, and request.cf already
    // carries the viewer's coordinates, so no geo lookup is needed upstream.
    const latitude = Number(request.cf?.latitude);
    const longitude = Number(request.cf?.longitude);

    const result = await handleRequest({
      method: request.method,
      query: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(request.headers),
      sourceIp: request.headers.get('CF-Connecting-IP'),
      geo: { latitude, longitude }
    }, readConfig(env));

    return new Response(result.body || null, { status: result.status, headers: result.headers });
  }
};
