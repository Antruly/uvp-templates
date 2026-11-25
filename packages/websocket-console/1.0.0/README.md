# WebSocket console 1.0.0

A self-contained libuvcpp text/binary echo service and build-free browser console. It demonstrates same-origin connection lifecycle, text and hex sending, visible message history, byte counts and explicit history truncation/drop counts.

The interaction is independently implemented from the generic browser workflow in uvscope's `web/src/views/WebSocketView.vue` at `0e1ea68d1f0b791c0e3cd40109a94db06fff7fd4`. No daemon session proxy, application stores, business code or authentication is copied. The C++ endpoint follows uvp's existing libuvcpp echo pattern.

Requires uvp >=0.4.0 and libuvcpp >=1.9.1 <2.0.0 with Web, WebApp, WebSocket and static serving. Build the generated project using plain CMake, run from its root and open its configured port; no frontend build is needed. The delivered README documents endpoints, effects and limits.

MIT. This is a development starter with no authentication, persistence, external-target proxy, TLS setup or load-generation claim.
