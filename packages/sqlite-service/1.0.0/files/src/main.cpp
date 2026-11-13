#include <uvcpp/uvcpp_config.h>

#if !defined(UVCPP_WEBAPP_ENABLE) || !UVCPP_WEBAPP_ENABLE
#error "sqlite-service requires libuvcpp built with UVCPP_BUILD_WEBAPP=ON"
#endif
#if !defined(UVCPP_DB_ENABLE) || !UVCPP_DB_ENABLE
#error "sqlite-service requires libuvcpp built with UVCPP_ENABLE_DB=ON"
#endif
#if !defined(UVCPP_DB_SQLITE_ENABLE) || !UVCPP_DB_SQLITE_ENABLE
#error "sqlite-service requires libuvcpp built with SQLite enabled"
#endif

#include <db/uvcpp_db_params.h>
#include <db/uvcpp_db_pool.h>
#include <db/uvcpp_db_status.h>
#include <db/uvcpp_db_table.h>
#include <webapp/uvcpp_web_app.h>
#include <webapp/uvcpp_web_request.h>
#include <webapp/uvcpp_web_response.h>
#include <webapp/uvcpp_web_static.h>

#include <nlohmann/json.hpp>

#include <cstdlib>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

using namespace uvcpp;

namespace {

std::string ReadSchema() {
  std::ifstream file("schema/001_items.sql", std::ios::binary);
  if (!file) return {};
  std::ostringstream contents;
  contents << file.rdbuf();
  return contents.str();
}

std::string DbError(const char* message, uvcpp_db_status status) {
  return std::string(R"({"error":")") + message + R"(","status":")" +
         uvcpp_db_status_name(status) + R"("})";
}

}  // namespace

int main() {
  uvcpp_web_app app;
  app.set_port({{project.port}});

  const char* configured_url = std::getenv("UVP_DATABASE_URL");
  const std::string url = configured_url != nullptr && configured_url[0] != '\0'
                              ? configured_url
                              : "sqlite://./{{project.name}}.db";
  if (url.rfind("sqlite://", 0) != 0) {
    std::cerr << "UVP_DATABASE_URL must use sqlite://\n";
    return 1;
  }
  uvcpp_db_pool pool;
  const uvcpp_db_status opened = pool.init(url, 1, 4);
  if (!uvcpp_db_ok(opened)) {
    std::cerr << "cannot open " << url << ": " << uvcpp_db_status_name(opened) << ": "
              << pool.last_error() << "\n";
    return 1;
  }
  pool.set_timeout_ms(5000);

  const std::string schema = ReadSchema();
  if (schema.empty()) {
    std::cerr << "cannot read schema/001_items.sql from the working directory\n";
    return 1;
  }
  const uvcpp_db_status migrated = pool.execute(schema, uvcpp_db_params());
  if (!uvcpp_db_ok(migrated)) {
    std::cerr << "cannot apply schema: " << uvcpp_db_status_name(migrated) << ": "
              << pool.last_error() << "\n";
    return 1;
  }

  app.get("/healthz", [](uvcpp_web_request&, uvcpp_web_response& response, uvcpp_web_next) {
    response.status(200).json_str(R"({"status":"ok"})");
    response.end();
  });

  app.get("/api/items", [&app, &pool](uvcpp_web_request&, uvcpp_web_response& response,
                                       uvcpp_web_next next) {
    uvcpp_web_response* const output = &response;
    const int dispatched = pool.query(
        app.loop(), "SELECT id, value, created_at FROM items ORDER BY created_at DESC, id",
        [output, next](uvcpp_db_status status, const uvcpp_db_table& rows) {
          if (uvcpp_db_ok(status)) output->status(200).json_str(rows.to_json());
          else output->status(500).json_str(DbError("query failed", status));
          output->end();
          next();
        });
    if (dispatched != 0) {
      response.status(503).json_str(R"({"error":"database is not accepting work"})");
      response.end();
    }
  });

  app.get("/api/items/:id", [&app, &pool](uvcpp_web_request& request,
                                          uvcpp_web_response& response, uvcpp_web_next next) {
    const std::string* const id = request.param("id");
    if (id == nullptr) {
      response.status(400).json_str(R"({"error":"missing id"})");
      response.end();
      return;
    }
    uvcpp_db_params params;
    params.add(*id);
    uvcpp_web_response* const output = &response;
    const int dispatched = pool.query(
        app.loop(), "SELECT id, value, created_at FROM items WHERE id = ?", params,
        [output, next](uvcpp_db_status status, const uvcpp_db_table& rows) {
          if (!uvcpp_db_ok(status)) output->status(500).json_str(DbError("query failed", status));
          else if (rows.empty()) output->status(404).json_str(R"({"error":"not found"})");
          else output->status(200).json_str(rows.to_json());
          output->end();
          next();
        });
    if (dispatched != 0) {
      response.status(503).json_str(R"({"error":"database is not accepting work"})");
      response.end();
    }
  });

  app.post("/api/items", [&app, &pool](uvcpp_web_request& request,
                                       uvcpp_web_response& response, uvcpp_web_next next) {
    nlohmann::json payload = nlohmann::json::parse(request.body_str(), nullptr, false);
    if (payload.is_discarded() || !payload.is_object() ||
        !payload.contains("id") || !payload["id"].is_string() ||
        !payload.contains("value") || !payload["value"].is_string()) {
      response.status(400).json_str(R"({"error":"expected JSON string fields id and value"})");
      response.end();
      return;
    }
    const std::string id = payload["id"].get<std::string>();
    const std::string value = payload["value"].get<std::string>();
    if (id.empty() || value.empty()) {
      response.status(400).json_str(R"({"error":"id and value must be non-empty strings"})");
      response.end();
      return;
    }
    uvcpp_db_params params;
    params.add(id);
    params.add(value);
    uvcpp_web_response* const output = &response;
    const int dispatched = pool.execute(
        app.loop(), "INSERT INTO items (id, value) VALUES (?, ?) ON CONFLICT(id) DO NOTHING", params,
        [output, next](uvcpp_db_status status, int64_t affected) {
          if (!uvcpp_db_ok(status)) output->status(500).json_str(DbError("insert failed", status));
          else if (affected == 0) output->status(409).json_str(R"({"error":"id already exists"})");
          else output->status(201).json_str(std::string(R"({"stored":)") +
                                            std::to_string(affected) + "}");
          output->end();
          next();
        });
    if (dispatched != 0) {
      response.status(503).json_str(R"({"error":"database is not accepting work"})");
      response.end();
    }
  });

  app.put("/api/items/:id", [&app, &pool](uvcpp_web_request& request,
                                          uvcpp_web_response& response, uvcpp_web_next next) {
    const std::string* const id = request.param("id");
    const auto payload = nlohmann::json::parse(request.body_str(), nullptr, false);
    if (id == nullptr || payload.is_discarded() || !payload.is_object() ||
        !payload.contains("value") || !payload["value"].is_string() ||
        payload["value"].get<std::string>().empty()) {
      response.status(400).json_str(R"({"error":"expected a non-empty JSON string field value"})");
      response.end();
      return;
    }
    uvcpp_db_params params;
    params.add(payload["value"].get<std::string>());
    params.add(*id);
    uvcpp_web_response* const output = &response;
    const int dispatched = pool.execute(
        app.loop(), "UPDATE items SET value = ? WHERE id = ?", params,
        [output, next](uvcpp_db_status status, int64_t affected) {
          if (!uvcpp_db_ok(status)) output->status(500).json_str(DbError("update failed", status));
          else if (affected == 0) output->status(404).json_str(R"({"error":"not found"})");
          else output->status(200).json_str(R"({"updated":true})");
          output->end();
          next();
        });
    if (dispatched != 0) {
      response.status(503).json_str(R"({"error":"database is not accepting work"})");
      response.end();
    }
  });

  app.del("/api/items/:id", [&app, &pool](uvcpp_web_request& request,
                                               uvcpp_web_response& response,
                                               uvcpp_web_next next) {
    const std::string* const id = request.param("id");
    if (id == nullptr) {
      response.status(400).json_str(R"({"error":"missing id"})");
      response.end();
      return;
    }
    uvcpp_db_params params;
    params.add(*id);
    uvcpp_web_response* const output = &response;
    const int dispatched = pool.execute(
        app.loop(), "DELETE FROM items WHERE id = ?", params,
        [output, next](uvcpp_db_status status, int64_t affected) {
          if (!uvcpp_db_ok(status)) output->status(500).json_str(DbError("delete failed", status));
          else if (affected == 0) output->status(404).json_str(R"({"error":"not found"})");
          else output->status(200).json_str(R"({"deleted":true})");
          output->end();
          next();
        });
    if (dispatched != 0) {
      response.status(503).json_str(R"({"error":"database is not accepting work"})");
      response.end();
    }
  });

  uvcpp_web_static_options static_options;
  static_options.spa_fallback = true;
  app.serve_static("/", "./frontend/dist", static_options);

  const int rc = app.start();
  if (rc != 0) {
    std::cerr << "failed to start on port {{project.port}}: libuv error " << rc << "\n";
    return 1;
  }
  std::cout << "serving from " << url << "\nlistening on " << app.bound_port() << "\n"
            << std::flush;
  app.join();
  return 0;
}
