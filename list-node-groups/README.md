# The Node Groups list

A Node.js script that demonstrates how to retrieve your nodes IPs using the [Ceeblue API].

This document also describes the API call (/node-groups) and a node-change callback feature. This is useful if you need to allowlist the Ceeblue nodes for security reasons.

## The /node-groups API call

To obtain the list of the nodes currently assigned to your account you need to call the /node-groups API :

```bash
https://api.ceeblue.tv/v1/node-groups
```

**Notes :**

* You need to have custom group(s) assigned to your account to see the list of your nodes.
* There are two types of nodes: persistent nodes and allocated (scalable) nodes. In the case of allocated nodes, you may have to request the node list regularly to keep your list up to date.

## Node change callback

To receive notifications about node changes, such as the addition of new nodes or changes due to maintenance activities, you must request the setup of this callback service from our team. This ensures you're always informed of updates to your node list, helping maintain the accuracy and reliability of your services.

**Notification Structure Example:**

When the callback is set up, your service will receive notifications with the following structure:

```json
{
"timestamp": 1700215500382,
"nodes": [
    {
        "type": "Persistent",
        "hostname": "node-1.live.ceeblue.tv",
        "ipAddress": "89.100.29.1",
        "geo": {
        "latitude": 51.9466,
        "longitude": 6.4616
        }
    },
    {
        "type": "Persistent",
        "hostname": "node-2.live.ceeblue.tv",
        "ipAddress": "89.100.29.2",
        "geo": {
        "latitude": 51.9466,
        "longitude": 6.4616
        }
    }
]
}
```

### Requesting Callback Setup

To request the setup of the node change callback for your account, please contact our support team. Our team will guide you through the setup process and ensure that your service is configured to receive timely and relevant node status updates.

## Getting Started

### Prerequisites

Ensure that you have Node.js installed on your machine to execute this script. Visit [Node.js official website] for installation instructions.

### Installation

Begin by installing the necessary dependencies to run the script:

```bash
npm install
```

### Configuration

1. **Authentication:**

    * Securely authenticate by setting the `CEEBLUE_TOKEN` environment variable with your JWT. Refer to the [Ceeblue API authentication guide] for details.
    * Alternatively you can use the `CEEBLUE_USERNAME` and `CEEBLUE_PASSWORD` environment variables to authenticate.

2. **Execution:** Run the script using the command below:

    ```bash
    node list-node-groups.js
    ```

3. **Options:** The following environment variables can be set to customize the failover service:

    * `CEEBLUE_API_URL`: Set the Ceeblue API URL (default is `https://api.ceeblue.net/v1`).
    * `CEEBLUE_TOKEN`: Set the Ceeblue API token.
    * `CEEBLUE_USERNAME`: Set the Ceeblue API username (if not using token).
    * `CEEBLUE_PASSWORD`: Set the Ceeblue API password (if not using token).

    You can set these variables when running the script, for example:

    ```bash
    CEEBLUE_TOKEN=mytoken node list-node-groups.js
    ```

## Customization & Expansion

This script serves as a foundational example. You're encouraged to delve into the list-node-groups.js file to tailor it to your unique requirements. The code is thoroughly commented to facilitate an understanding of its operation and to guide you in integrating more sophisticated API interactions and failover strategies.

[Ceeblue API]: https://docs.ceeblue.net/reference/
[Node.js official website]: https://nodejs.org/en/download/
[Ceeblue API authentication guide]: https://docs.ceeblue.net/reference/authorization
