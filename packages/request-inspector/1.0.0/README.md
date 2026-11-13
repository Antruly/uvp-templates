# Request inspector 1.0.0

A standalone libuvcpp service and build-free browser request console. It reports the method, content type, original byte count and bounded body preview actually received by the service. Truncation and UTF-8 replacement semantics are explicit.

The generic request/response interaction is independently implemented, inspired by uvscope's web workbench at `0e1ea68d1f0b791c0e3cd40109a94db06fff7fd4`. No application-specific API, daemon proxy, stores, business logic or authentication is included. Original example code is MIT licensed.

Requires uvp >=0.4.0 and libuvcpp >=1.9.1 <2.0.0 with WebApp and static serving. Generated source builds with plain CMake and has no uvp runtime dependency. Run from the generated project root and open the configured port; no frontend build is needed. See the delivered README for API, build commands, effects and limits.

This is a same-origin development starter, not a general HTTP client, proxy, persistent capture service or binary archive.
