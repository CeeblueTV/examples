// Runtime-neutral core of the output resolver.
//
// Turns a stream id into a per-viewer playback endpoint by calling
// POST /outputs on the viewer's behalf, so the account credentials stay on the
// server and never reach the browser.
//
// One POST /outputs call per viewer: the endpoint is selected from the viewer's
// address and is single-use, so it must not be cached or shared. The JWT is the
// only cacheable part.
//
// This file has no runtime-specific code and no dependencies. The entry points
// in worker.mjs, server.mjs and lambda.mjs are thin adapters over handleRequest.

const DEFAULT_API_BASE = 'https://api.ceeblue.tv/v1';
const DEFAULT_TIMEOUT_MS = 5000;

const FORMATS = new Set(['WebRTC', 'HLS', 'DASH', 'RTMP', 'RTSP']);

// Players need an explicit MIME type for the HTTP formats. WebRTC must have
// none, or a Video.js WebRTC source handler will decline the source.
const MIME_TYPES = { HLS: 'application/x-mpegURL', DASH: 'application/dash+xml' };

// Ceeblue stream names may contain '+' (e.g. "out+<uuid>"), so it has to be
// allowed here. Callers must percent-encode it as %2B or it arrives as a space.
const STREAM_ID = /^[A-Za-z0-9+._~:@-]{1,128}$/;

// The resolver is open by design: it exposes nothing that publishing a static
// endpoint did not already expose. Put access control in front of it if needed.
export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-max-age': '86400'
};

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS };

function trimSlash(value) {
  return value ? String(value).replace(/\/+$/, '') : '';
}

/**
 * Build a config object from a source of environment values. Workers pass their
 * `env` binding, Node passes `process.env`.
 */
export function readConfig(source = {}) {
  return {
    username: source.CEEBLUE_USERNAME,
    password: source.CEEBLUE_PASSWORD,
    apiBase: trimSlash(source.CEEBLUE_API_BASE) || DEFAULT_API_BASE,
    timeoutMs: Number(source.UPSTREAM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    trustForwardedFor: source.TRUST_FORWARDED_FOR === 'true'
  };
}

// Cached across requests for the life of the isolate or container. Concurrent
// requests share the same in-flight login rather than each starting one.
let tokenPromise = null;

async function login(config) {
  const response = await fetch(`${config.apiBase}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: config.username, password: config.password }),
    signal: AbortSignal.timeout(config.timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`login failed with ${response.status}`);
  }
  const { token } = await response.json();

  if (!token) {
    throw new Error('login response carried no token');
  }
  return token;
}

// Cache the promise, not the token, so concurrent requests share a login. A
// refresh only replaces the promise that supplied the rejected token; if
// another request already replaced it, reuse that request's refresh instead.
function getToken(config, stalePromise) {
  if (tokenPromise === null || (stalePromise && tokenPromise === stalePromise)) {
    const nextPromise = login(config).catch(error => {
      // An older failed login must not clear a newer in-flight refresh.
      if (tokenPromise === nextPromise) {
        tokenPromise = null;
      }
      throw error;
    });

    tokenPromise = nextPromise;
  }
  return tokenPromise;
}

function createOutput(config, token, streamId, format, viewer) {
  const body = { format, streamId };

  if (viewer) {
    body.viewer = viewer;
  }
  return fetch(`${config.apiBase}/outputs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.timeoutMs)
  });
}

// The edge is chosen from this address, so getting it wrong degrades routing
// silently instead of failing. See "Running behind a proxy" in the README.
function viewerFrom(request, config) {
  let ipAddress = request.sourceIp;

  if (config.trustForwardedFor) {
    const headers = request.headers || {};
    const key = Object.keys(headers).find(name => name.toLowerCase() === 'x-forwarded-for');

    if (key && headers[key]) {
      ipAddress = String(headers[key]).split(',')[0].trim();
    }
  }

  const viewer = {};

  if (ipAddress) {
    viewer.ipAddress = ipAddress;
  }
  // Workers know where the viewer is without a lookup; other runtimes do not.
  if (Number.isFinite(request.geo?.latitude) && Number.isFinite(request.geo?.longitude)) {
    viewer.geoLocation = { latitude: request.geo.latitude, longitude: request.geo.longitude };
  }
  return Object.keys(viewer).length ? viewer : undefined;
}

function json(status, body) {
  return { status, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

/**
 * Resolve one request.
 *
 * @param request {method, query, headers, sourceIp, geo} normalised by the adapter
 * @param config from readConfig()
 * @return {status, headers, body} with body already serialised
 */
export async function handleRequest(request, config) {
  if (request.method === 'OPTIONS') {
    return { status: 204, headers: CORS, body: '' };
  }
  if (!config.username || !config.password) {
    console.error('CEEBLUE_USERNAME / CEEBLUE_PASSWORD are not configured');
    return json(500, { error: 'misconfigured', message: 'Service is not configured' });
  }

  const query = request.query || {};
  const streamId = query.stream;
  const format = query.format || 'WebRTC';

  if (!streamId || !STREAM_ID.test(streamId)) {
    return json(400, { error: 'bad-request', message: 'Missing or malformed "stream"' });
  }
  if (!FORMATS.has(format)) {
    return json(400, { error: 'bad-request', message: `Unsupported "format": ${format}` });
  }

  const viewer = viewerFrom(request, config);

  try {
    let tokenRequest = getToken(config);
    let token = await tokenRequest;
    let response = await createOutput(config, token, streamId, format, viewer);

    // A cached token can outlive its validity (revoked, password rotated).
    if (response.status === 401) {
      tokenRequest = getToken(config, tokenRequest);
      token = await tokenRequest;
      response = await createOutput(config, token, streamId, format, viewer);
    }

    if (response.status === 404) {
      // Normal before a broadcast starts: the player keeps polling.
      return json(404, { error: 'not-found', message: 'Stream is not available' });
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');

      console.error('outputs failed', response.status, detail.slice(0, 500));
      return json(502, { error: 'upstream-error', message: 'Could not resolve an endpoint' });
    }

    const output = await response.json();
    const connection = output.connection || output;
    const src = connection.signallingUri || connection.uri;

    if (!src) {
      console.error('outputs returned no endpoint', JSON.stringify(output).slice(0, 500));
      return json(502, { error: 'upstream-error', message: 'Endpoint missing from response' });
    }

    return json(200, {
      src,
      format,
      type: MIME_TYPES[format] ?? null,
      stun: connection.stun ?? null,
      turn: connection.turn ?? null
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';

    console.error('endpoint resolution failed', error);
    return json(timedOut ? 504 : 502, {
      error: timedOut ? 'upstream-timeout' : 'upstream-error',
      message: 'Could not resolve an endpoint'
    });
  }
}
