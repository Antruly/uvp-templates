# {{project.name}}

Standalone libuvcpp request inspection service with a build-free browser console. No uvp runtime or Node build is required.

## Build and run

Install libuvcpp >=1.9.1 <2.0.0 with WebApp and static serving enabled, then:

```sh
cmake -S . -B build -DCMAKE_PREFIX_PATH=/path/to/libuvcpp
cmake --build build
./build/{{project.name}}
```

Run from the generated project root so `public/` resolves. Open http://localhost:{{project.port}} and send text, JSON or XML. The body is inspected as bytes, not parsed as JSON or XML. The page sends only to its own `/api/inspect`; it is not an external HTTP proxy.

## API and limits

`GET /healthz` returns process health. `POST /api/inspect` returns JSON containing `method`, `content_type`, `body_bytes`, `body_preview`, `preview_limit_bytes` (4,096), `preview_source_bytes`, `truncated` and an encoding description. No query string, authorization, cookie or other header is included. Only POST is registered for inspection.

A valid UTF-8 code point is not split at the preview boundary. Invalid sequences are replaced with U+FFFD when serializing JSON, so the preview is text, not a lossless binary representation. `preview_source_bytes` counts original bytes selected before replacement. Replacement may expand the serialized preview. Truncation means some source bytes were omitted, not that invalid encoding was preserved.

The preview bound limits the response, not the request transport. libuvcpp receives the body before the handler runs; this starter does not add streaming upload limits or persistent capture storage. The browser times out a request after 10 seconds and displays errors. Reload clears the displayed response.

The generated process listens on its configured port and the browser makes same-origin HTTP requests. The server makes no outbound requests. No authentication or TLS configuration is included. Use a trusted development environment and avoid sending secrets, or add access controls before exposing the service.
