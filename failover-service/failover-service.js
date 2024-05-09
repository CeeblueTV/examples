#!/usr/bin/env node

/**
 * This is is a template script implementing an example of a failover service that :
 * - Retrieves the current best endpoint for viewers to connect to,
 * - Implement a failover mechanism to switch to another stream in case of failure.
 *
 * Note that it does not manage the Ceeblue streams and the streams must exist in the Ceeblue platform.
 *
 * API :
 * - POST/GET/DELETE /stream/:alias : CRUD operations on a stream
 * - GET /streams : returns the list of available streams
 *
 * Usage :
 * CEEBLUE_TOKEN=<Your bearer> ./failover-service.js
 */

import * as sdk from '../common/ceeblue-api.js';
import bodyParser from 'body-parser';
import express from 'express';

// Get the environment arguments
const API_URL = process.env.CEEBLUE_API_URL || 'https://api.ceeblue.tv/v1';
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const USERNAME = process.env.CEEBLUE_USERNAME;
const PASSWORD = process.env.CEEBLUE_PASSWORD;

// If the JWT token is not provided, login with the username and password
if (!process.env.CEEBLUE_TOKEN) {
    // Retrieve the JSON Web Token
    if (!PASSWORD || !USERNAME) {
        console.error('Missing Ceeblue auth credentials or JWT token. Please set CEEBLUE_USER_NAME and CEEBLUE_PASSWORD or CEEBLUE_TOKEN environment variables.');
        process.exit(1);
    }
    await sdk.login(USERNAME, PASSWORD, API_URL);
} else {
    sdk.auth(process.env.CEEBLUE_TOKEN, API_URL);
}

// A map of streams with the alias as key and the primary and secondary stream IDs as value
const streams = new Map();

// Start the service
const app = express();
app.use(bodyParser.json());
app.listen(HTTP_PORT, () => {
    console.log(`Service listening on port ${HTTP_PORT}`);
});

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
 * curl -X POST http://localhost:3000/stream/myStream -H "Content-Type: application/json" -d '{"primary": "0771dbae-e63c-4794-b714-cf9a1d3f0d6f", "secondary": "5a8915ba-d0d7-4de7-bff9-551f58b3a501"}'
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

    // Create a new stream with the given alias
    streams.set(req.params.alias, {primary: req.body.primary, secondary: req.body.secondary});
    res.send(true);
});

/**
 * Get the stream Endpoint URL for the given alias and format
 * The service will try to get the primary stream first, then the secondary one if the primary is not available
 * The load balancer will be called to get the endpoint URL
 *
 * Example of fetch request from a viewer :
 * fetch('http://localhost:3000/stream/myStream/WebRTC').then(response => response.text()).then(endpoint =>{
 *  console.log('Stream endpoint : ', endpoint);
 * });
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
    // By default, return the primary stream endpoint even if it's not active
        let streamId = stream.primary;

        // If the primary stream is inactive and the secondary stream is active, use the secondary stream
        if (!(await sdk.isStreamActive(stream.primary)) && stream.secondary && await sdk.isStreamActive(stream.secondary)) {
            streamId = stream.secondary;
        }
        const endpoint = await sdk.getStreamEndpoint(streamId, req.params.format);
        res.send(endpoint);
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
