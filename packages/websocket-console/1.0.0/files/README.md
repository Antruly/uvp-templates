# {{project.name}}

A libuvcpp text/binary WebSocket echo service and a browser console. No Node build or uvp runtime is needed.

## Build and run

Install libuvcpp >=1.9.1 <2.0.0 with Web, WebApp, WebSocket and static serving enabled.

```sh
cmake -S . -B build -DCMAKE_PREFIX_PATH=/path/to/libuvcpp
cmake --build build
./build/{{project.name}}
```

Start from the generated project root so `public/` resolves. Open http://localhost:{{project.port}}, click Connect, then send text or hexadecimal byte pairs. Disconnect closes the socket; Connect starts a new connection. `GET /healthz` returns process health. `/ws` echoes text and binary messages to their sender; it does not broadcast or persist them.

The browser uses the page's own host and port and chooses `ws:` or `wss:` based on the page scheme. The standalone server starts with plain HTTP; this template does not configure TLS. The browser console cannot target external servers or set custom handshake headers.

History retains 100 entries and at most 4,096 characters per entry. Binary previews show at most 1,365 bytes as hex. The page reports original payload byte lengths, cumulative dropped entries, and entries whose previews were truncated. Clear resets history and counters. Reload also clears history. These display bounds do not impose transport message limits; transport buffering and frame limits are owned by libuvcpp. This starter is not a load test or a durable capture system.

The service opens a listener and the page opens a WebSocket to it. No authentication or authorization is included. Use a trusted development environment or add access controls before external exposure.
