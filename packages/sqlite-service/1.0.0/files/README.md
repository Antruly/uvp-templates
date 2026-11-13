# {{project.name}}

A Vue frontend and libuvcpp JSON service backed by SQLite. The generated project has no uvp runtime dependency.

## Build and run

Install libuvcpp >=1.9.1 <2.0.0 with WebApp, static serving, database and SQLite enabled. Make its CMake package discoverable using `CMAKE_PREFIX_PATH` if needed.

```sh
cmake -S . -B build -DCMAKE_PREFIX_PATH=/path/to/libuvcpp
cmake --build build
cd frontend
npm ci
npm run build
cd ..
./build/{{project.name}}
```

Build the frontend before starting the service. Run from the project root so `schema/001_items.sql` and `frontend/dist` resolve. Open http://localhost:{{project.port}}. For frontend development, run `npm run dev` inside `frontend/` while the backend is running; Vite proxies the API to port {{project.port}}.

The default database URL is `sqlite://./{{project.name}}.db`. Set an absolute path for a stable location; create its parent directory first:

```sh
UVP_DATABASE_URL=sqlite:///var/lib/{{project.name}}/app.db ./build/{{project.name}}
```

Only `sqlite://` URLs are accepted. `schema/001_items.sql` runs at startup with `CREATE TABLE IF NOT EXISTS`. This initializes a new database and preserves existing records; it is not a versioned migration runner. Back up the database before schema changes.

## API

- `GET /healthz` reports process health; it does not probe the database.
- `GET /api/items` lists records in a database-table JSON object whose `rows` field contains the records.
- `GET /api/items/:id` returns the same envelope with one row, or 404.
- `POST /api/items` accepts `{"id":"example","value":"Hello"}`; returns 201, or 409 for a duplicate ID.
- `PUT /api/items/:id` accepts `{"value":"Updated"}`; returns 200, or 404 if missing.
- `DELETE /api/items/:id` returns 200, or 404 if missing.

JSON fields must be non-empty strings. Queries bind parameters rather than interpolating SQL. Invalid JSON returns 400, database execution errors return 500, and rejected database work returns 503.

The interface supports listing, creation, editing and deletion. SQLite is the only backend this starter claims; PostgreSQL has not been tested. No authentication or authorization is included. Add access controls before exposing this starter to untrusted networks.
