#!/usr/bin/env node

/**
 * This is is a template script implementing an example of a failover service that :
 * - Retrieves the current best endpoint for viewers to connect to,
 * - Implement a failover mechanism to switch to another stream in case of failure.
 * 
 * API :
 * - POST/GET/DELETE /stream/:alias : CRUD operations on a stream
 * - GET /streams : returns the list of available streams
 * 
 * Usage :
 * CEEBLUE_TOKEN=<Your bearer> ./failover-service.js
 */

import api from 'api';
import bodyParser from 'body-parser';
import express from 'express';

const HTTP_PORT = process.env.HTTP_PORT || 3000;

const sdk = new api('@ceeblue/v1.0.0#1ggp2h2hqldiwus98');
const app = express();

// A map of streams with the alias as key and the primary and secondary stream IDs as value
const streams = new Map();

// Start the service
app.use(bodyParser.json());
app.listen(HTTP_PORT, () => {
  console.log(`Service listening on port ${HTTP_PORT}`);
});

// Authenticate with the Ceeblue API
if (!process.env.CEEBLUE_TOKEN) {
  console.error('Missing Ceeblue JWT token (see https://docs.ceeblue.net/reference/authorization)');
  process.exit(1);
}
sdk.auth(process.env.CEEBLUE_TOKEN);

/////////////////////////////
// Ceeblue helper functions
/////////////////////////////

/**
 * Check if the given stream is active
 * See https://docs.ceeblue.net/reference/get-inputs-by-id
 * @returns {Promise<boolean>} True if the stream is active and running
 */
async function isStreamActive(streamId) {
  return new Promise((resolve, reject) => {
    sdk.getInputsById({id: streamId})
      .then(({ data }) => {
        console.log(`Stream status of ${streamId}: ${data.status}`);
        resolve(data.status === 'Ingestion');
      })
      .catch(err => {
        reject(err);
      });
  });
}

/**
 * Retrieves the stream endpoint URL for the given format and primary stream ID
 * (This is calling the load balancer)
 * @returns {Promise<string>} The output object (see https://docs.ceeblue.net/reference/post-outputs)
 */
async function getStreamEndpoint(streamId, format) {
  return new Promise((resolve, reject) => {
    sdk.postOutputs({format, streamId})
      .then(({ data }) => {
        console.log(`Stream ${streamId}/${format} output : ${JSON.stringify(data)}`);
        resolve(data);
      })
      .catch(err => {
        reject(err);
      });
  });
}

/////////////////////////////
// Service API
/////////////////////////////

/**
 * Create a new stream with the given alias
 * @param {string} alias - The stream alias
 * 
 * body parameters :
 * - primary : the Ceeblue primary stream ID
 * - secondary : the Ceeblue secondary stream ID (optional)
 * 
 * /!\ The streams must exist in the Ceeblue platform
 * 
 * Example of curl command :
 * curl -X POST http://localhost:3000/stream/myStream -H "Content-Type: application/json" -d '{"primary": "primaryStreamId", "secondary": "secondaryStreamId"}'
 */
app.post('/stream/:alias', (req, res) => {
  console.log(`Creating a new stream : ${req.params.alias}, ${JSON.stringify(req.body)}...`);
  if (streams.has(req.params.alias)) {
    // Code 409 : Conflict
    res.status(409).send('Stream already exists');
    return;
  }
  if (!req.body.primary) {
    // Code 400 : Bad request
    res.status(400).send('Missing primary stream');
    return;
  }

  // Create a new stream with the given alias, 
  streams.set(req.params.alias, {primary: req.body.primary, secondary: req.body.secondary});
  res.send(true);
});

/**
 * Get the stream Endpoint URL for the given alias and format
 * The service will try to get the primary stream first, then the secondary one if the primary is not available
 * The load balancer will be called to get the endpoint URL
 * 
 * Example of curl command :
 * curl -X GET http://localhost:3000/stream/myStream/WebRTC
 * 
 * @param {string} alias - The stream alias
 * @param {string} format - The stream format (RTMP, WebRTC, HLS, CMAF, RTSP, SRT, UDPTS, Internode, HLS_CMAF, DASH_CMAF, JSONMetadata, HESP)
 */
app.get('/stream/:alias/:format', async (req, res) => {
  console.log(`Getting the stream : ${req.params.alias}, ${req.params.format}...`);
  const stream = streams.get(req.params.alias);
  if (!stream) {
    res.status(404).send('Stream not found');
    return;
  }

  // Check if the primary stream is ingesting
  try {
    if (await isStreamActive(stream.primary)) {
      const endpoint = await getStreamEndpoint(stream.primary, req.params.format);
      res.send(endpoint);
    } else if (stream.secondary && await isStreamActive(stream.secondary)) {
      // Otherwise, if the secondary stream is active, use it
      const endpoint = await getStreamEndpoint(stream.secondary, req.params.format);
      res.send(endpoint);
    } else {
      // By default, return the primary stream endpoint even if it's not active
      const endpoint = await getStreamEndpoint(stream.primary, req.params.format);
      res.send(endpoint);
    }
  } catch (err) {
    console.log(err && err.data ? err.data.message : err);
    res.status(500).send('Error getting the stream endpoint');
    return;
  }
});

/**
 * Delete the stream with the given alias
 * 
 * Example of curl command :
 * curl -X DELETE http://localhost:3000/stream/myStream
 */
app.delete('/stream/:alias', (req, res) => {
  console.log(`Deleting the stream : ${req.params.alias}...`);
  if (!streams.has(req.params.alias)) {
    res.status(404).send('Stream not found');
    return;
  }

  streams.delete(req.params.alias);
  res.send('Stream deleted');
});

/**
 * Get the list of available streams
 * 
 * Example of curl command :
 * curl -X GET http://localhost:3000/streams
 */
app.get('/streams', (req, res) => {
  console.log('Sending the list of streams');
  // Serialize the map
  const result = Array.from(streams).map(([alias, stream]) => ({alias, stream}));
  res.send(result);
});
