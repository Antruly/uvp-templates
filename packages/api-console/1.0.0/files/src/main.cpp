// API console — a small Postman-style HTTP client served by a libuvcpp webapp.
//
// The page talks to this service only. The service performs the outbound
// request (so the browser never deals with CORS) and keeps the request
// history and saved collections.
//
// Routes:
//   GET    /healthz                 readiness
//   GET    /api/health              same as /healthz
//   POST   /api/send                perform one outbound HTTP/HTTPS request
//   GET    /api/history             recent exchanges (newest first)
//   DELETE /api/history             clear history
//   GET    /api/collections         saved requests
//   POST   /api/collections         save a request
//   DELETE /api/collections/:id     remove a saved request
//
// Networking happens on libuv's thread pool, not the loop thread: the HTTP
// client's synchronous path blocks, and blocking the loop would stop every
// other connection.

#include <webapp/uvcpp_web_app.h>
#include <webapp/uvcpp_web_json.h>
#include <webapp/uvcpp_web_request.h>
#include <webapp/uvcpp_web_response.h>

#include <req/uvcpp_work.h>

#include <web/uvcpp_http_client.h>
#include <web/uvcpp_http_request.h>
#include <web/uvcpp_http_reply.h>
#include <ssl/uvcpp_ssl.h>

#include <algorithm>
#include <cctype>
#include <cerrno>
#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <deque>
#include <fstream>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

#if defined(__linux__)
#include <fcntl.h>
#include <poll.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#elif defined(_WIN32)
#include <direct.h>
#include <windows.h>
#endif

using namespace uvcpp;

namespace {

// ---------------------------------------------------------------------------
// Small value types
// ---------------------------------------------------------------------------

struct SavedRequest {
  std::string method = "GET";
  std::string url;
  std::vector<std::pair<std::string, std::string> > headers;
  std::string body;
  bool verify_tls = true;
  int timeout_ms = 15000;
};

struct OutboundResult {
  bool ok = false;
  bool url_ok = false;
  int status = 0;
  std::string status_text;
  std::vector<std::pair<std::string, std::string> > headers;
  std::string body;
  long long elapsed_ms = 0;
  std::string error;
};

struct HistoryEntry {
  std::string id;
  std::string at;
  SavedRequest request;
  int status = 0;
  bool ok = false;
  long long elapsed_ms = 0;
};

struct StoredRequest {
  std::string id;
  std::string name;
  SavedRequest request;
};

std::deque<HistoryEntry> g_history;
std::vector<StoredRequest> g_collections;
std::string g_collections_path;
unsigned long long g_seq = 0;

const std::size_t kHistoryLimit = 100;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

std::string Trim(const std::string& s) {
  std::size_t b = 0;
  std::size_t e = s.size();
  while (b < e && (s[b] == ' ' || s[b] == '\t' || s[b] == '\r' || s[b] == '\n')) ++b;
  while (e > b && (s[e - 1] == ' ' || s[e - 1] == '\t' || s[e - 1] == '\r' || s[e - 1] == '\n')) --e;
  return s.substr(b, e - b);
}

std::string NowIso() {
  std::time_t t = std::time(nullptr);
  std::tm tm_buf;
#if defined(_WIN32)
  gmtime_s(&tm_buf, &t);
#else
  gmtime_r(&t, &tm_buf);
#endif
  char buf[32];
  std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm_buf);
  return std::string(buf);
}

std::string NextId(const char* prefix) {
  std::ostringstream oss;
  oss << prefix << '-' << std::time(nullptr) << '-' << ++g_seq;
  return oss.str();
}

// The executable lives in build/; the document root sits next to the source
// tree it was configured from. Resolve it from the executable so the service
// works regardless of the working directory it is started in.
std::string ExecutableDir() {
#if defined(__linux__)
  char buf[4096];
  const ssize_t n = readlink("/proc/self/exe", buf, sizeof(buf) - 1);
  if (n > 0) {
    std::string path(buf, static_cast<std::size_t>(n));
    const std::size_t slash = path.find_last_of('/');
    if (slash != std::string::npos) return path.substr(0, slash);
  }
#elif defined(_WIN32)
  char buf[MAX_PATH];
  const DWORD n = GetModuleFileNameA(nullptr, buf, MAX_PATH);
  if (n > 0) {
    std::string path(buf, n);
    const std::size_t slash = path.find_last_of("\\/");
    if (slash != std::string::npos) return path.substr(0, slash);
  }
#endif
  return std::string(".");
}

std::string PublicDir() {
  const std::string dir = ExecutableDir();
  // build/../public, with a plain relative fallback for a source-tree run.
  const std::string candidate = dir + "/../public";
  std::ifstream probe(candidate + "/index.html", std::ios::binary);
  if (probe.good()) return candidate;
  return std::string("public");
}

// ---------------------------------------------------------------------------
// JSON <-> request
// ---------------------------------------------------------------------------

bool ParseHeaderList(const uvcpp_json& j, std::vector<std::pair<std::string, std::string> >& out,
                     std::string& error) {
  out.clear();
  if (j.is_object()) {
    for (auto it = j.begin(); it != j.end(); ++it) {
      if (!it.value().is_string()) {
        error = "header '" + it.key() + "' must have a string value";
        return false;
      }
      out.push_back(std::make_pair(it.key(), it.value().get<std::string>()));
    }
    return true;
  }
  if (j.is_array()) {
    for (const auto& item : j) {
      if (!item.is_object()) {
        error = "each header must be an object";
        return false;
      }
      std::string name;
      std::string value;
      if (item.contains("name") && item["name"].is_string()) {
        name = item["name"].get<std::string>();
      } else if (item.contains("key") && item["key"].is_string()) {
        name = item["key"].get<std::string>();
      }
      if (item.contains("value") && item["value"].is_string()) {
        value = item["value"].get<std::string>();
      }
      if (name.empty() && value.empty()) continue;  // empty editor row
      if (name.empty()) {
        error = "header value without a name";
        return false;
      }
      out.push_back(std::make_pair(name, value));
    }
    return true;
  }
  if (!j.is_null()) {
    error = "headers must be an object or an array";
    return false;
  }
  return true;
}

bool ParseSavedRequest(const uvcpp_json& j, SavedRequest& out, std::string& error) {
  if (!j.is_object()) {
    error = "request must be a JSON object";
    return false;
  }
  if (j.contains("method")) {
    if (!j["method"].is_string()) {
      error = "method must be a string";
      return false;
    }
    out.method = j["method"].get<std::string>();
  }
  if (j.contains("url")) {
    if (!j["url"].is_string()) {
      error = "url must be a string";
      return false;
    }
    out.url = Trim(j["url"].get<std::string>());
  }
  if (j.contains("headers")) {
    if (!ParseHeaderList(j["headers"], out.headers, error)) return false;
  }
  if (j.contains("body")) {
    if (!j["body"].is_string()) {
      error = "body must be a string";
      return false;
    }
    out.body = j["body"].get<std::string>();
  }
  if (j.contains("verify_tls")) {
    if (!j["verify_tls"].is_boolean()) {
      error = "verify_tls must be a boolean";
      return false;
    }
    out.verify_tls = j["verify_tls"].get<bool>();
  }
  if (j.contains("timeout_ms")) {
    if (!j["timeout_ms"].is_number_integer()) {
      error = "timeout_ms must be an integer";
      return false;
    }
    out.timeout_ms = j["timeout_ms"].get<int>();
    if (out.timeout_ms < 1000) out.timeout_ms = 1000;
    if (out.timeout_ms > 120000) out.timeout_ms = 120000;
  }
  if (out.url.empty()) {
    error = "url is required";
    return false;
  }
  return true;
}

uvcpp_json HeadersToJson(const std::vector<std::pair<std::string, std::string> >& headers) {
  uvcpp_json arr = uvcpp_json::array();
  for (const auto& h : headers) {
    uvcpp_json item;
    item["name"] = h.first;
    item["value"] = h.second;
    arr.push_back(item);
  }
  return arr;
}

uvcpp_json SavedRequestToJson(const SavedRequest& r) {
  uvcpp_json j;
  j["method"] = r.method;
  j["url"] = r.url;
  j["headers"] = HeadersToJson(r.headers);
  j["body"] = r.body;
  j["verify_tls"] = r.verify_tls;
  j["timeout_ms"] = r.timeout_ms;
  return j;
}

std::string DumpJson(const uvcpp_json& j) {
  // Response bodies are arbitrary bytes; replace invalid UTF-8 instead of
  // letting dump() throw.
  return j.dump(-1, ' ', false, uvcpp_json::error_handler_t::replace);
}

// ---------------------------------------------------------------------------
// Outbound request (runs on a worker thread)
// ---------------------------------------------------------------------------

// The outbound exchange is performed using libuvcpp's public HTTP client.
// This client supports HTTPS with proper TLS handshake handling as of libuvcpp 1.8.1.
// This process runs on a libuv worker thread, so blocking never blocks the web loop.
void PerformSend(const SavedRequest& in, OutboundResult& out) {
  const auto started = std::chrono::steady_clock::now();

  if (in.body.size() > 512u * 1024u) {
    out.error = "request body exceeds the 512 KiB limit";
    return;
  }

  try {
    uvcpp_http_client client;
    
    // The TLS context must outlive the client's use of it, so it is declared
    // here rather than inside the branch that configures it.
    std::unique_ptr<uvcpp_ssl_context> tls_ctx;
    if (in.url.compare(0, 8, "https://") == 0) {
      tls_ctx.reset(new uvcpp_ssl_context(tls_mode::CLIENT));
      tls_ctx->set_verify_mode(in.verify_tls ? tls_verify_mode::PEER
                                             : tls_verify_mode::NONE);
      client.set_ssl_context(tls_ctx.get());
    }

    // Parse URL: scheme://host[:port]/path?query
    const std::string& url = in.url;
    std::size_t scheme_end = url.find("://");
    if (scheme_end == std::string::npos) {
      out.error = "invalid URL: missing scheme";
      return;
    }
    
    const std::string scheme = url.substr(0, scheme_end);
    const std::size_t host_start = scheme_end + 3;
    
    // Find the path start (first / after host)
    std::size_t path_start = url.find('/', host_start);
    if (path_start == std::string::npos) {
      path_start = url.size();
    }
    
    std::string host_port = url.substr(host_start, path_start - host_start);
    std::string path = (path_start < url.size()) ? url.substr(path_start) : "/";
    
    // Extract host and port
    int port = (scheme == "https") ? 443 : 80;
    std::string host = host_port;
    std::size_t colon_pos = host_port.rfind(':');
    
    if (colon_pos != std::string::npos && colon_pos > 0) {
      // Check if this is IPv6 literal in brackets
      if (host_port[0] != '[') {
        host = host_port.substr(0, colon_pos);
        try {
          int p = std::stoi(host_port.substr(colon_pos + 1));
          if (p > 0 && p < 65536) {
            port = p;
          } else {
            out.error = "invalid port number";
            return;
          }
        } catch (...) {
          out.error = "invalid port number";
          return;
        }
      }
    }

    // Determine HTTP method
    http_method method = http_method::HTTP_GET;
    std::string method_upper = in.method;
    std::transform(method_upper.begin(), method_upper.end(), method_upper.begin(),
                   [](unsigned char c) { return static_cast<char>(std::toupper(c)); });

    if (method_upper == "GET") method = http_method::HTTP_GET;
    else if (method_upper == "POST") method = http_method::HTTP_POST;
    else if (method_upper == "PUT") method = http_method::HTTP_PUT;
    else if (method_upper == "DELETE") method = http_method::HTTP_DELETE;
    else if (method_upper == "HEAD") method = http_method::HTTP_HEAD;
    else if (method_upper == "PATCH") method = http_method::HTTP_PATCH;
    else if (method_upper == "OPTIONS") method = http_method::HTTP_OPTIONS;
    else if (method_upper == "TRACE") method = http_method::HTTP_TRACE;
    else if (method_upper == "CONNECT") method = http_method::HTTP_CONNECT;

    // Build request
    uvcpp_http_request req;
    req.method = method;
    req.url = path;
    
    // Add headers
    for (const auto& h : in.headers) {
      if (!h.first.empty()) {
        req.set_header(h.first, h.second);
      }
    }
    
    // Set body if present
    if (!in.body.empty()) {
      req.body = uvcpp_buf(in.body.data(), in.body.size());
    }

    // Connect to host:port
    int connect_err = client.connect_wait(host.c_str(), port, in.timeout_ms);
    if (connect_err != 0) {
      out.error = "connection failed with libuv error code " + std::to_string(connect_err);
      return;
    }

    // Send request and receive response
    uvcpp_http_response resp;
    int send_err = client.send_wait(req, resp, in.timeout_ms);
    
    out.elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - started).count();

    if (send_err != 0) {
      out.error = "request failed with libuv error code " + std::to_string(send_err);
      return;
    }

    // Populate result from response
    out.ok = true;
    out.status = static_cast<int>(resp.status_code);
    out.status_text = resp.status_message;
    out.body = resp.body.to_string();
    
    // Copy response headers
    for (const auto& h : resp.headers) {
      out.headers.push_back({h.name, h.value});
    }

  } catch (const std::exception& e) {
    out.error = std::string("exception: ") + e.what();
  } catch (...) {
    out.error = "unknown exception during HTTP request";
  }
}

uvcpp_json OutboundToJson(const OutboundResult& r, const SavedRequest& request) {
  uvcpp_json j;
  j["ok"] = r.ok;
  j["status"] = r.status;
  j["status_text"] = r.status_text;
  j["headers"] = HeadersToJson(r.headers);
  j["body"] = r.body;
  j["bytes"] = static_cast<unsigned long long>(r.body.size());
  j["elapsed_ms"] = r.elapsed_ms;
  j["error"] = r.error;
  j["request"] = SavedRequestToJson(request);
  return j;
}

// ---------------------------------------------------------------------------
// Collections persistence
// ---------------------------------------------------------------------------

void SaveCollections() {
  uvcpp_json root;
  root["version"] = 1;
  uvcpp_json items = uvcpp_json::array();
  for (const auto& c : g_collections) {
    uvcpp_json item;
    item["id"] = c.id;
    item["name"] = c.name;
    item["request"] = SavedRequestToJson(c.request);
    items.push_back(item);
  }
  root["items"] = items;

  const std::string tmp = g_collections_path + ".tmp";
  {
    std::ofstream out(tmp, std::ios::binary | std::ios::trunc);
    if (!out) {
      std::cerr << "collections: cannot write " << tmp << "\n";
      return;
    }
    out << DumpJson(root);
  }
  std::rename(tmp.c_str(), g_collections_path.c_str());
}

void LoadCollections() {
  std::ifstream in(g_collections_path, std::ios::binary);
  if (!in) return;
  std::ostringstream ss;
  ss << in.rdbuf();
  const std::string text = ss.str();
  if (text.empty()) return;

  uvcpp_json root = uvcpp_json::parse(text, nullptr, false);
  if (root.is_discarded() || !root.is_object() || !root.contains("items") ||
      !root["items"].is_array()) {
    std::cerr << "collections: ignoring unreadable " << g_collections_path << "\n";
    return;
  }
  for (const auto& item : root["items"]) {
    if (!item.is_object()) continue;
    StoredRequest stored;
    if (item.contains("id") && item["id"].is_string()) stored.id = item["id"].get<std::string>();
    if (item.contains("name") && item["name"].is_string()) stored.name = item["name"].get<std::string>();
    std::string error;
    if (item.contains("request") && ParseSavedRequest(item["request"], stored.request, error) &&
        !stored.name.empty()) {
      if (stored.id.empty()) stored.id = NextId("col");
      g_collections.push_back(stored);
    }
  }
}

uvcpp_json CollectionsToJson() {
  uvcpp_json arr = uvcpp_json::array();
  for (const auto& c : g_collections) {
    uvcpp_json item;
    item["id"] = c.id;
    item["name"] = c.name;
    item["request"] = SavedRequestToJson(c.request);
    arr.push_back(item);
  }
  return arr;
}

uvcpp_json HistoryToJson() {
  uvcpp_json arr = uvcpp_json::array();
  for (const auto& h : g_history) {
    uvcpp_json item;
    item["id"] = h.id;
    item["at"] = h.at;
    item["status"] = h.status;
    item["ok"] = h.ok;
    item["elapsed_ms"] = h.elapsed_ms;
    item["request"] = SavedRequestToJson(h.request);
    arr.push_back(item);
  }
  return arr;
}

}  // namespace

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

int main(int argc, char** argv) {
  int port = {{project.port}};
  if (argc > 1) {
    const int requested = std::atoi(argv[1]);
    if (requested > 0 && requested <= 65535) port = requested;
  }

  {
    const std::string dir = ExecutableDir();
    const std::string data_dir = dir + "/../data";
#if defined(_WIN32)
    _mkdir(data_dir.c_str());
#else
    mkdir(data_dir.c_str(), 0755);
#endif
    g_collections_path = data_dir + "/collections.json";
    LoadCollections();
  }

  uvcpp_web_app app;
  app.set_host("127.0.0.1").set_port(port);

  app.get("/healthz", [](uvcpp_web_request&, uvcpp_web_response& resp, uvcpp_web_next) {
    resp.status(200).json_str(R"({"status":"ok"})");
    resp.end();
  });

  app.get("/api/health", [](uvcpp_web_request&, uvcpp_web_response& resp, uvcpp_web_next) {
    uvcpp_json j;
    j["status"] = "ok";
    j["service"] = "{{project.name}}";
    j["version"] = "0.1.0";
    resp.status(200).json_str(DumpJson(j));
    resp.end();
  });

  app.post("/api/send", [&app](uvcpp_web_request& req, uvcpp_web_response& resp,
                               uvcpp_web_next next) {
    uvcpp_json doc;
    json_status st = json_status::OK;
    if (!req.json(doc, &st)) {
      uvcpp_json err;
      err["ok"] = false;
      err["error"] = std::string("invalid JSON body: ") + json_status_name(st);
      resp.status(400).json_str(DumpJson(err));
      resp.end();
      return;
    }

    SavedRequest saved;
    std::string error;
    if (!ParseSavedRequest(doc, saved, error)) {
      uvcpp_json err;
      err["ok"] = false;
      err["error"] = error;
      resp.status(400).json_str(DumpJson(err));
      resp.end();
      return;
    }

    uvcpp_web_response* rp = &resp;
    std::shared_ptr<OutboundResult> result = std::make_shared<OutboundResult>();

    uvcpp_work* work = new uvcpp_work();
    if (work->init() != 0) {
      delete work;
      uvcpp_json err;
      err["ok"] = false;
      err["error"] = "could not initialize the worker request";
      resp.status(500).json_str(DumpJson(err));
      resp.end();
      return;
    }

    work->queue_work(
        app.loop(),
        [saved, result](uvcpp_work*) { PerformSend(saved, *result); },
        [saved, result, rp, next](uvcpp_work* done, int) {
          HistoryEntry entry;
          entry.id = NextId("h");
          entry.at = NowIso();
          entry.request = saved;
          entry.status = result->status;
          entry.ok = result->ok;
          entry.elapsed_ms = result->elapsed_ms;
          g_history.push_front(entry);
          while (g_history.size() > kHistoryLimit) g_history.pop_back();

          rp->status(200).json_str(DumpJson(OutboundToJson(*result, saved)));
          rp->end();
          next();
          delete done;
        });
  });

  app.get("/api/history", [](uvcpp_web_request&, uvcpp_web_response& resp, uvcpp_web_next) {
    uvcpp_json j;
    j["items"] = HistoryToJson();
    resp.status(200).json_str(DumpJson(j));
    resp.end();
  });

  app.del("/api/history", [](uvcpp_web_request&, uvcpp_web_response& resp, uvcpp_web_next) {
    g_history.clear();
    resp.status(200).json_str(R"({"ok":true})");
    resp.end();
  });

  app.get("/api/collections", [](uvcpp_web_request&, uvcpp_web_response& resp, uvcpp_web_next) {
    uvcpp_json j;
    j["items"] = CollectionsToJson();
    resp.status(200).json_str(DumpJson(j));
    resp.end();
  });

  app.post("/api/collections", [](uvcpp_web_request& req, uvcpp_web_response& resp,
                                  uvcpp_web_next) {
    uvcpp_json doc;
    json_status st = json_status::OK;
    if (!req.json(doc, &st) || !doc.is_object()) {
      uvcpp_json err;
      err["ok"] = false;
      err["error"] = "invalid JSON body";
      resp.status(400).json_str(DumpJson(err));
      resp.end();
      return;
    }
    StoredRequest stored;
    stored.id = NextId("col");
    if (doc.contains("name") && doc["name"].is_string()) {
      stored.name = Trim(doc["name"].get<std::string>());
    }
    if (stored.name.empty()) {
      uvcpp_json err;
      err["ok"] = false;
      err["error"] = "name is required";
      resp.status(400).json_str(DumpJson(err));
      resp.end();
      return;
    }
    std::string error;
    if (!doc.contains("request") || !ParseSavedRequest(doc["request"], stored.request, error)) {
      uvcpp_json err;
      err["ok"] = false;
      err["error"] = error.empty() ? std::string("request is required") : error;
      resp.status(400).json_str(DumpJson(err));
      resp.end();
      return;
    }
    g_collections.push_back(stored);
    SaveCollections();

    uvcpp_json out;
    out["ok"] = true;
    out["id"] = stored.id;
    resp.status(201).json_str(DumpJson(out));
    resp.end();
  });

  app.del("/api/collections/:id", [](uvcpp_web_request& req, uvcpp_web_response& resp,
                                     uvcpp_web_next) {
    const std::string* id = req.param("id");
    if (id == nullptr) {
      resp.status(400).json_str(R"({"ok":false,"error":"missing id"})");
      resp.end();
      return;
    }
    const std::size_t before = g_collections.size();
    g_collections.erase(
        std::remove_if(g_collections.begin(), g_collections.end(),
                       [&id](const StoredRequest& c) { return c.id == *id; }),
        g_collections.end());
    if (g_collections.size() == before) {
      resp.status(404).json_str(R"({"ok":false,"error":"not found"})");
      resp.end();
      return;
    }
    SaveCollections();
    resp.status(200).json_str(R"({"ok":true})");
    resp.end();
  });

  // API routes are registered first; literal routes outrank the static
  // wildcard, so /api/* is never answered from the document root.
  app.serve_static("/", PublicDir());

  const int rc = app.start();
  if (rc != 0) {
    std::cerr << "failed to start on port " << port << ": libuv error " << rc << "\n";
    return 1;
  }

  std::cout << "{{project.name}} listening on http://127.0.0.1:" << app.bound_port()
            << "\n  document root: " << PublicDir()
            << "\n  outbound engine: libuvcpp native HTTP client (1.8.1+)\n"
            << std::flush;
  app.join();
  return 0;
}
