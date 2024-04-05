let baseUrl = 'https://api.ceeblue.tv/v1';
let jwToken = undefined;

// Fetch Ceeblue API
export async function fetchAPI(path, method = 'GET', body = undefined) {
    return new Promise((resolve, reject) => {
        fetch(`${baseUrl}/${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'authorization': jwToken ? `Bearer ${jwToken}` : '',
            },
            body: body ? JSON.stringify(body) : undefined
        }).then(response => {
            if (response.ok) {
                response.json().then(json => {
                    resolve(json);
                }).catch(error => {
                    console.log('Fetch json error :', error, response.statusText);
                    reject(response.statusText);
                });
            } else {
                console.log('Fetch status error : ', response.statusText);
                reject(response.statusText);
            }
        }).catch(error => {
            console.log('Fetch error : ', error);
            reject(error);
        });
    });
}

// Set the JWT token
export function auth(token) {
    jwToken = token;
}

// Ceeblue api mapping
export async function login(username, password, apiUrl = undefined) {
    // Override the base URL if provided
    if (apiUrl) {
        baseUrl = apiUrl;
    }
    return new Promise((resolve, reject) => {
        fetchAPI('login', 'POST', {username, password}).then(result => {
            jwToken = result && result.token;
            resolve(result && result.token);
        }).catch(error => {
            reject(error);
        });
    });
}

export async function getInputs() {
    return new Promise((resolve, reject) => {
        fetchAPI('inputs').then(result => {
            resolve(result);
        }).catch(error => {
            reject(error);
        });
    });
}

export async function getInputsById(streamId) {
    return new Promise((resolve, reject) => {
        fetchAPI(`inputs/${streamId}`, 'GET').then(result => {
            resolve(result);
        }).catch(error => {
            reject(error);
        });
    });
}

export async function postOutputs({format, streamId}) {
    return new Promise((resolve, reject) => {
        fetchAPI('outputs', 'POST', {format, streamId}).then(result => {
            resolve(result);
        }).catch(error => {
            reject(error);
        });
    });
}

// helper functions

/**
 * Check if the given stream is active
 * See https://docs.ceeblue.net/reference/get-inputs-by-id
 * @returns {Promise<boolean>} True if the stream is active and running
 */
export async function isStreamActive(streamId) {
    return new Promise((resolve, reject) => {
        getInputsById(streamId).then(result => {
            console.log(`Stream status of ${streamId}: ${result.status}`);
            resolve(result && result.status === 'Ingestion');
        }).catch(error => {
            reject(error);
        });
    });
}

/**
 * Retrieves the stream endpoint URL for the given format and primary stream ID
 * (This is calling the load balancer)
 * @returns {Promise<string>} The output object (see https://docs.ceeblue.net/reference/post-outputs)
 */
export async function getStreamEndpoint(streamId, format) {
    return new Promise((resolve, reject) => {
        postOutputs({format, streamId}).then(result => {
            console.log(`Stream ${streamId}/${format} output : ${JSON.stringify(result)}`);
            resolve(result);
        }).catch(error => {
            reject(error);
        });
    });
}
