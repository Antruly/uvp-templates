# SQLite service 1.0.0

A standalone fullstack starter with a libuvcpp SQLite database pool, JSON CRUD API, startup schema initialization, and a Vue records interface. It contains generic example records and no application-specific business logic or authentication.

Requires uvp >=0.4.0 and libuvcpp >=1.9.1 <2.0.0 with WebApp, static serving, database and SQLite enabled. The generated project builds with plain CMake against an installed libuvcpp. Build the frontend with `npm ci && npm run build` before starting the service. The delivered README documents build commands, database URL configuration, API responses and schema limitations.

The database URL comes from `UVP_DATABASE_URL` and must use `sqlite://`; the default is a local project database. Initial schema creation is idempotent, not a migration framework. SQLite is the only claimed backend; PostgreSQL is unverified. The starter has no authentication or authorization.

Original example code distributed under MIT. No moLink Server source, domain model or authentication code is included.
