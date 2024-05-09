# Failover service Template

Welcome to the Failover Service Template, an illustrative example designed to showcase a resilient streaming solution utilizing the [Ceeblue API]. This template equips you with a robust script that:

Dynamically retrieves the most optimal streaming endpoint for viewers.
Implements a redundancy mechanism to seamlessly switch to a backup stream in the event of a primary stream failure, ensuring an uninterrupted viewing experience.
The diagram below visualizes the failover architecture facilitated by this script, highlighting its role in maintaining stream availability and quality:

[![Failover service architecture](ceeblue-stream-redundancy.png)](ceeblue-stream-redundancy.png)

> The API object on the right side is this script.

## Getting Started

### Prerequisites

1. This script uses Callback URI to be informed of stream status in real-time, this is very useful to prevent useless repeated requests. **You need to create the streams with a [callbackUri] in the Ceeblue API or Dashboard to make this service work.**

    The URI to set has the following format : `http://<host>/callbacks/<alias>`

    Where `<host>` is the IP address or domain name and port of the server running the failover service, and `<alias>` is the alias of the stream you want to monitor.

2. Ensure that you have Node.js installed on your machine to execute this script. Visit [Node.js official website] for installation instructions.

### Installation

Begin by installing the necessary dependencies to run the failover service:

```bash
npm install
```

### Configuration

1. **Authentication:**

    * Securely authenticate by setting the `CEEBLUE_TOKEN` environment variable with your JWT. Refer to the [Ceeblue API authentication guide] for details.
    * Alternatively you can use the `CEEBLUE_USERNAME` and `CEEBLUE_PASSWORD` environment variables to authenticate.

2. **Execution:** Run the script using the command below:

    ```bash
    node failover-service.js
    ```

3. **Options:** The following environment variables can be set to customize the failover service:

    * `HTTP_PORT`: Specify the port to listen to (default is 3000).
    * `CEEBLUE_API_URL`: Set the Ceeblue API URL (default is `https://api.ceeblue.net/v1`).
    * `CEEBLUE_TOKEN`: Set the Ceeblue API token.
    * `CEEBLUE_USERNAME`: Set the Ceeblue API username (if not using token).
    * `CEEBLUE_PASSWORD`: Set the Ceeblue API password (if not using token).

    You can set these variables when running the script, for example:

    ```bash
    HTTP_PORT=8080 node failover-service.js
    ```

## Example of usage from the player side

To play the stream with our [Videojs plugins], you can use the following code snippet in your player's JavaScript code. This code fetches the stream URL from the failover service `host` and sets it as the source for the player:

```Javascript
    let player = videojs("video-player");
    fetch('http://<host>/stream/<alias>/WebRTC')
    .then(response=> {
        if (!response.ok) {
            console.error('Error fetching stream URL : ' + response.statusText);
            return;
        }
        response.json().then(data=>{        
            player.pause();
            player.reset();
            player.src({src: data.connection.signallingUri});
        }).catch(error=>{
            console.error('Error parsing JSON : '+error);
        });
    });
```

> Replace `<host>` with the IP address or domain name and port of the server running the failover service.
> Replace `<alias>` with the alias of the stream you want to monitor.
> You can also update this code to retry fetching the stream URL in case of an error.

## Customization & Expansion

This script serves as a foundational example. You're encouraged to delve into the failover-service.js file to tailor it to your unique requirements. The code is thoroughly commented to facilitate an understanding of its operation and to guide you in integrating more sophisticated API interactions and failover strategies.

[callbackUri]: https://docs.ceeblue.net/reference/post-inputs
[Ceeblue API]: https://docs.ceeblue.net/reference/
[Node.js official website]: https://nodejs.org/en/download/
[Ceeblue API authentication guide]: https://docs.ceeblue.net/reference/authorization
[Videojs plugins]: https://github.com/CeeblueTV/videojs-plugins