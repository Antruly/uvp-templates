# api-console

An HTTP debugging console in the shape of a small Postman: a libuvcpp service
performs outbound HTTP/HTTPS exchanges, and a same-origin static page provides
the request editor, response viewer, HTML preview, history, and saved
collections.

## What the package demonstrates

- A fullstack libuvcpp service: JSON API routes plus a static SPA from
  `public/`, served by one `uvcpp_web_app`.
- Blocking work (the outbound exchange) executed on libuv's thread pool via
  `uvcpp_work`, with the response written back on the loop thread.
- A sandboxed HTML preview: response HTML is rendered in an iframe without
  `allow-same-origin`, with a `<base>` injected from the request URL.
- Collections persisted to `data/collections.json`; history kept in memory.

## Variables

| Variable | Type | Default | Used for |
| --- | --- | --- | --- |
| `name` | slug | `api-console` | CMake target, binary, `uvp.json`, README |
| `port` | port | `8090` | default listen port and `uvp.json` |

## Routes

- `GET /healthz`
- `GET /api/health`
- `POST /api/send`
- `GET /api/history`
- `DELETE /api/history`
- `GET /api/collections`
- `POST /api/collections`
- `DELETE /api/collections/:id`

## Generate, build, run

```bash
uvp init ./console --name console --port 8090 --template-package api-console@1.0.0
uvp doctor ./console
uvp build ./console
uvp run ./console
```

## Runtime dependency — read this before review

The generated service invokes **`uvp http --json`** for every outbound request.
It is located through `UVP_BIN`, `PATH`, or `$HOME/node_modules/.bin/uvp`.
That is a runtime dependency on the uvp CLI, which the registry's contribution
rules currently disallow ("no uvp runtime dependency and no dependency on a
file outside the generated workspace").

The dependency is deliberate and is why this package is filed as a policy
question rather than a claimed self-contained package. On the machine this was
developed and verified against (uvp-agents 0.4.0, libuvcpp 1.8.0), the public
`uvcpp_http_client` TLS path did not deliver HTTPS responses, while `uvp http`
did. A self-contained package becomes possible in one of two ways:

1. libuvcpp/uvp fixes the public outbound TLS client; the template then drops
   the subprocess bridge, or
2. `uvp.template/1` gains an explicit runtime-dependency field so a package can
   declare `uvp` truthfully.

Until then, the package is complete, buildable, and verifiable, but it does not
meet the self-contained rule. The accompanying uvp issue tracks the decision.

## Verification performed

- `uvp build`: succeeds against libuvcpp 1.8.0 with GCC 13.3.
- `uvp verify`: 9 requests, 27 assertions, 0 failures, `status: verified`
  (UI, static assets, health, HTTP and HTTPS round trips through
  `POST /api/send`, history, collections).
- A real Chrome session: send `https://www.baidu.com`, open the preview tab,
  and the page renders in the sandboxed iframe.

## Licence and provenance

MIT. Authored for the uvp template registry; source is this repository.
