#!/usr/bin/env node

/**
 * This script retrieves the list of nodes from the API /node-groups endpoint
 * 
 * Usage :
 * CEEBLUE_TOKEN=<Your bearer> ./list-node-groups.js
 */

import * as sdk from '../common/ceeblue-api.js';

// Get the environment arguments
const API_URL = process.env.CEEBLUE_API_URL || 'https://api.ceeblue.tv/v1';
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
    sdk.auth(process.env.CEEBLUE_TOKEN);
}

// Retrieve the list of nodes from the API /nodes-groups endpoint
const nodeGroups = await sdk.fetchAPI('node-groups', 'GET');
if (!nodeGroups) {
    process.exit(2);
}

// Get the ips of the nodes from the list of nodes
const ips = new Map();
for (const nodeGroup of nodeGroups) {
    for (const node of nodeGroup.resources) {
        const nodeIp = {};
        if (node.node.hostname)
            nodeIp.hostname = node.node.hostname;
        if (node.node.publicIPv4)
            nodeIp.ip = node.node.publicIPv4;
        if (nodeIp.ip || nodeIp.hostname)
            ips.set(nodeIp.hostname || node.ip, nodeIp);
    }
}

console.log(ips.entries());
