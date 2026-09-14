# Output Resolver

A small HTTP service that turns a stream id into a playback endpoint chosen for
the viewer asking for it. Point a web player at it instead of hardcoding a host,
and every viewer is served from a suitable edge instead of all landing on the
same one.

It runs unchanged on **Cloudflare Workers**, **your own server**, or **AWS
Lambda**.

> Looking for backup-stream switching as well? [failover-service/](../failover-service/)
> does that on top of the same endpoint resolution. Use this one if you only
> need per-viewer endpoints.

## Why it exists

`POST /outputs` selects an edge from the viewer's IP address, and the endpoint
it returns is single-use. So the endpoint cannot be baked into a page, and it
cannot be resolved in the browser either — that call needs your account
credentials, which must never reach a viewer.

This service sits in between. It holds the credentials and exposes one thing:
*give me an endpoint for this stream*.

```
 browser / player
    │  GET /?stream=<streamId>&format=WebRTC
    ▼
 resolver ─── POST /v1/login    (once per instance, JWT kept in memory)
          └── POST /v1/outputs  (once per viewer, with the viewer's address)
    │
    ▼
 { "src": "wss://edge-tokyo.../webrtc/<streamId>", "format": "WebRTC", "type": null }
```

**One `POST /outputs` per viewer, per connection attempt.** The endpoint is
single-use and viewer-specific, so it cannot be cached or shared. The JWT is the
only cacheable part. Size accordingly — see [Scale](#scale).

## Request

```
GET /?stream=<streamId>[&format=WebRTC|HLS|DASH]
```

`format` defaults to `WebRTC`. If a stream id contains `+`, percent-encode it as
`%2B` — a bare `+` in a query string decodes to a space.

## Response

```json
{
  "src": "wss://edge-tokyo.ceeblue.tv/webrtc/<streamId>",
  "format": "WebRTC",
  "type": null,
  "stun": "stun:edge-tokyo.ceeblue.tv:3478",
  "turn": "turn:edge-tokyo.ceeblue.tv:3478"
}
```

`type` is the MIME type a player needs for HLS and DASH, and `null` for WebRTC —
Video.js WebRTC source handlers decline a source that carries a type.

| Status | `error` | Meaning |
|---|---|---|
| 400 | `bad-request` | Missing or malformed `stream`, or unsupported `format`. |
| 404 | `not-found` | Stream is not available — normal before a broadcast starts. |
| 500 | `misconfigured` | Credentials are not set on the service. |
| 502 | `upstream-error` | The Ceeblue API failed. |
| 504 | `upstream-timeout` | The Ceeblue API did not answer in time. |

404 is expected traffic, not a fault: viewers who arrive early poll until the
broadcast starts.

## Files

```
resolver.mjs   the logic, runtime-neutral and dependency-free
worker.mjs     Cloudflare Workers entry
server.mjs     self-hosted / local entry (node:http)
lambda.mjs     AWS Lambda entry
```

Each entry point is a short adapter that normalises its runtime's request shape
and calls `handleRequest`. There are no dependencies anywhere — every runtime
here has `fetch` built in.

## Configuration

The same variables everywhere; only how you set them differs.

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `CEEBLUE_USERNAME` | yes | | Ceeblue API user. |
| `CEEBLUE_PASSWORD` | yes | | Ceeblue API password. |
| `CEEBLUE_API_BASE` | no | `https://api.ceeblue.tv/v1` | API base URL. |
| `UPSTREAM_TIMEOUT_MS` | no | `5000` | Per-request timeout to the Ceeblue API. |
| `TRUST_FORWARDED_FOR` | no | `false` | Take the viewer address from `X-Forwarded-For`. |
| `PORT` | no | `8100` | `server.mjs` only. |
| `VIEWER_IP` | no | | `server.mjs` only, for testing. See below. |

---

## Run it locally

```bash
CEEBLUE_USERNAME=api-user@example.com CEEBLUE_PASSWORD=... node server.mjs
```

```bash
curl 'http://localhost:8100/?stream=<streamId>'
```

Your own machine has a private address, so the API cannot locate it and falls
back to a default edge. To check that edge selection really varies, pretend to
be somewhere:

```bash
VIEWER_IP=203.0.113.7 CEEBLUE_USERNAME=... CEEBLUE_PASSWORD=... node server.mjs
```

---

## Deploy: Cloudflare Workers

The least setup of the three, and the closest to the viewer.

```bash
npx wrangler login

# Set the account in wrangler.toml [vars], and the password as a secret
npx wrangler secret put CEEBLUE_PASSWORD

npx wrangler deploy
```

That prints a `https://ceeblue-output-resolver.<subdomain>.workers.dev` URL.

Workers suit this service well:

- **The viewer address is exact.** `CF-Connecting-IP` is the real client, and
  `request.cf` also carries coordinates, so `worker.mjs` sends
  `viewer.geoLocation` as well as `viewer.ipAddress`.
- **Billing is CPU time, not wall time.** This service spends nearly all its
  life waiting on two API calls, and waiting is not billed.
- **Secrets are write-only** once set.

One tradeoff: Workers run as many short-lived isolates spread across data
centres, so the cached JWT is reused less than on a long-lived server, and the
service logs in more often. With a long-lived token that is usually fine. If it
is not, cache the token in [Workers KV](https://developers.cloudflare.com/kv/) —
eventual consistency is not a problem for a long-lived credential.

## Deploy: your own server

`server.mjs` is plain `node:http` with no framework, so any Node 18+ host works.
Behind nginx or a load balancer for TLS:

```bash
CEEBLUE_USERNAME=... CEEBLUE_PASSWORD=... TRUST_FORWARDED_FOR=true \
  PORT=8100 node server.mjs
```

Set `TRUST_FORWARDED_FOR=true` **only** behind a proxy you control, and make
sure that proxy overwrites `X-Forwarded-For` rather than appending to a
client-supplied value — otherwise viewers can choose their own edge.

The service is stateless, so run as many instances as you like behind the load
balancer. Each keeps its own JWT.

## Deploy: AWS Lambda

Use `lambda.handler` as the handler, on `nodejs22.x` or later, with a Function
URL in front.

Lambda runs every function *as* an IAM role, so one has to exist first. This
service talks to nothing in AWS — writing its own logs is all it needs:

```bash
ROLE_ARN=$(aws iam create-role \
  --role-name ceeblue-output-resolver \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }]
  }' --query Role.Arn --output text)

aws iam attach-role-policy \
  --role-name ceeblue-output-resolver \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
```

```bash
zip function.zip resolver.mjs lambda.mjs

aws lambda create-function \
  --function-name ceeblue-output-resolver \
  --runtime nodejs22.x --handler lambda.handler \
  --role "$ROLE_ARN" --zip-file fileb://function.zip \
  --timeout 10 --memory-size 256

aws lambda update-function-configuration \
  --function-name ceeblue-output-resolver \
  --environment 'Variables={CEEBLUE_USERNAME=...,CEEBLUE_PASSWORD=...}'

aws lambda create-function-url-config \
  --function-name ceeblue-output-resolver --auth-type NONE

aws lambda add-permission \
  --function-name ceeblue-output-resolver \
  --statement-id FunctionURLAllowPublicAccess \
  --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE
```

Two things that catch people out:

- A freshly created role takes a few seconds to propagate. If `create-function`
  reports *"The role defined for the function cannot be assumed by Lambda"*,
  wait and run it again.
- Leave the Function URL's own CORS configuration empty — the service sends its
  own headers.

Deploying needs Lambda permissions plus `iam:PassRole` for that one role.
`iam:PassRole` cannot be avoided: handing a role to a service is itself
privileged, since otherwise anyone able to create a function could run it as an
administrator. It can be scoped to a single role:

```json
{
  "Effect": "Allow",
  "Action": "iam:PassRole",
  "Resource": "arn:aws:iam::<account-id>:role/ceeblue-output-resolver",
  "Condition": { "StringEquals": { "iam:PassedToService": "lambda.amazonaws.com" } }
}
```

---

## Running behind a proxy

The edge is chosen from the address that reaches the service. Put a CDN or proxy
in front without forwarding the client address and **every viewer is routed as
if they were in the proxy's region** — playback still works, so this fails
quietly and is easy to miss.

Either let browsers reach the service directly, or forward the real address and
set `TRUST_FORWARDED_FOR=true`. On Cloudflare Workers this is already handled:
`CF-Connecting-IP` is the client.

## Security

Credentials never leave the server — the browser only ever sees a resolved
endpoint. That is the property worth protecting.

Beyond that the service is deliberately unauthenticated: any origin, any stream
id. That is the same exposure as publishing a static playback URL, which is what
it replaces, so it is a reasonable default — but know it before the URL is
shared widely.

To tighten it, in increasing order of effort: restrict the
`access-control-allow-origin` in `resolver.mjs`, add a stream-id allowlist, then
per-viewer authorization. The last one is not a CORS matter; it needs a viewer
access token.

## Scale

One invocation per viewer per connection attempt, so:

- **20,000 viewers joining at once is 20,000 calls**, to the service and to the
  Ceeblue API.
- **An offline stream multiplies that by however many times players retry.** A
  player polling 30 times while waiting for a broadcast turns 20,000 waiting
  viewers into as many as 600,000 calls. Keep player retry counts modest and
  their backoff long for streams that may be down a while.
- On Lambda, raise the account concurrency limit before a large launch; the
  default is 1,000. On Workers, check your plan's request limits.

Jittered backoff in the player spreads retries so they do not arrive in
synchronised waves, but it does not reduce the total.
