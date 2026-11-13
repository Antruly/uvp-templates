# Admin console service

A minimal libuvcpp service for a same-origin Vue administration console. The application uses `/api/overview` as demonstration data; replace it with endpoints owned by your service.

The service listens on the configured HTTP port. It serves `frontend/dist` after the frontend is built and falls back to `index.html` for client-side routes. The configured port is substituted into the generated C++ source.

Build or install libuvcpp with `UVCPP_BUILD_WEBAPP=ON`. Its installed `uvcpp/uvcpp_config.h` is checked at compile time, so a library without `UVCPP_WEBAPP_ENABLE` enabled fails with a direct diagnostic. The package format has no field for expressing a CMake build option; this prerequisite is stated here and enforced by the generated source.

No authentication, authorization, TLS, database, WebSocket, external requests, or persistence is included. Do not expose a generated service beyond a trusted local network until you add and validate the security controls your application requires.
