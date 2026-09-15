// AWS Lambda entry point, for a Function URL or an HTTP API.
//
// Handler: lambda.handler
//
// Note that the viewer address is whatever reaches Lambda. Behind CloudFront
// that is the CDN, not the viewer: see "Running behind a proxy" in the README.

import { handleRequest, readConfig } from './resolver.mjs';

const config = readConfig(process.env);

export const handler = async (event) => {
  const result = await handleRequest({
    method: event.requestContext?.http?.method,
    query: event.queryStringParameters || {},
    headers: event.headers || {},
    sourceIp: event.requestContext?.http?.sourceIp
  }, config);

  return { statusCode: result.status, headers: result.headers, body: result.body };
};
