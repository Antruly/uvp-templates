# {{project.name}}

A small Postman-style HTTP console served by a libuvcpp web service generated
with uvp. The browser talks only to this service; the service performs the
outbound exchange, so there is no CORS problem and no browser-side TLS work.

## What it does

- Method, URL, headers, body, timeout, and TLS-verification controls
- Response status, timing, size, decoded body, and headers
- JSON pretty-printing when the response is JSON
- HTML preview in a sandboxed iframe, with a `<base>` injected so relative
  assets resolve against the original URL; the frame never gets
  `allow-same-origin`
- Request history (in memory, newest first, last 100)
- Saved collections, persisted to `data/collections.json`
- Same-origin UI served from `public/`, no CDN or external asset

## Build and run

```bash
uvp doctor .
uvp build .
uvp run .
```

The executable lives in `build/`; the document root is resolved relative to it
as `../public`. The CMake file records the libuvcpp library directory as a
transitive `DT_RPATH`, so `libuvcpp.so` and `libllhttp.so` are found without
setting `LD_LIBRARY_PATH`.

## Outbound engine

Outbound requests go through uvp's own `http` tool:

```bash
uvp http METHOD URL --json [--header NAME:VALUE] [--data BODY] [--no-tls]
```

`uvp` is located through `UVP_BIN`, then `PATH`, then
`$HOME/node_modules/.bin/uvp`. **This is a runtime dependency on the uvp CLI**
and is declared as such in the package README. It exists because libuvcpp
1.8.0's public `uvcpp_http_client` TLS path did not deliver HTTPS responses on
the machine this template was developed against; `uvp http` did.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/healthz` | readiness |
| GET | `/api/health` | service identity |
| POST | `/api/send` | perform one outbound request |
| GET | `/api/history` | recent exchanges |
| DELETE | `/api/history` | clear history |
| GET | `/api/collections` | saved requests |
| POST | `/api/collections` | save a request |
| DELETE | `/api/collections/:id` | remove a saved request |

`POST /api/send` takes `method`, `url`, `headers`, `body`, `verify_tls`,
`timeout_ms`, and returns `ok`, `status`, `status_text`, `headers`, `body`,
`bytes`, `elapsed_ms`, `error`, and the echoed `request`.

## Limits

- Request bodies over 512 KiB are refused: the bridge passes them as
  command-line arguments.
- Repeated response headers are joined into one value by `uvp http --json`.
- Binary response bodies are shown as decoded text; the byte count is the true
  size.
- Preview fetches subresources from the original site; pages needing the site's
  cookies or login session render differently.
