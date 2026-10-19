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
std::string g_uvp_bin = "uvp";
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

std::string FindOnPath(const std::string& name) {
  const char* path = std::getenv("PATH");
  if (path == nullptr) return std::string();
  const std::string paths(path);
  std::size_t start = 0;
  while (start <= paths.size()) {
    const std::size_t end = paths.find(':', start);
    const std::string dir =
        paths.substr(start, end == std::string::npos ? std::string::npos : end - start);
    if (!dir.empty()) {
      const std::string candidate = dir + "/" + name;
      if (access(candidate.c_str(), X_OK) == 0) return candidate;
    }
    if (end == std::string::npos) break;
    start = end + 1;
  }
  return std::string();
}

std::string ResolveUvpBinary() {
  const char* from_env = std::getenv("UVP_BIN");
  if (from_env != nullptr && from_env[0] != '\0') return std::string(from_env);

  const std::string on_path = FindOnPath("uvp");
  if (!on_path.empty()) return on_path;

  const char* home = std::getenv("HOME");
  if (home != nullptr && home[0] != '\0') {
    const std::string local = std::string(home) + "/node_modules/.bin/uvp";
    if (access(local.c_str(), X_OK) == 0) return local;
  }
  return std::string("uvp");
}

#if defined(_WIN32)
struct ProcResult {
  int exit_code = -1;
  bool timed_out = false;
  bool spawn_failed = true;
  std::string out;
  std::string err;
};

ProcResult RunProcess(const std::vector<std::string>&, int) { return ProcResult(); }
#else
struct ProcResult {
  int exit_code = -1;
  bool timed_out = false;
  bool spawn_failed = false;
  std::string out;
  std::string err;
};

// Run one child process without a shell. The argument vector is built before
// fork() so the child touches nothing but async-signal-safe calls before exec.
ProcResult RunProcess(const std::vector<std::string>& args, int timeout_ms) {
  ProcResult result;
  if (args.empty()) {
    result.spawn_failed = true;
    return result;
  }

  std::vector<char*> argv;
  argv.reserve(args.size() + 1);
  for (const auto& a : args) argv.push_back(const_cast<char*>(a.c_str()));
  argv.push_back(nullptr);

  int out_pipe[2] = {-1, -1};
  int err_pipe[2] = {-1, -1};
  if (pipe(out_pipe) != 0) {
    result.spawn_failed = true;
    return result;
  }
  if (pipe(err_pipe) != 0) {
    close(out_pipe[0]);
    close(out_pipe[1]);
    result.spawn_failed = true;
    return result;
  }

  const pid_t pid = fork();
  if (pid == 0) {
    const int devnull = open("/dev/null", O_RDONLY);
    if (devnull >= 0) {
      dup2(devnull, STDIN_FILENO);
      close(devnull);
    }
    dup2(out_pipe[1], STDOUT_FILENO);
    dup2(err_pipe[1], STDERR_FILENO);
    close(out_pipe[0]);
    close(out_pipe[1]);
    close(err_pipe[0]);
    close(err_pipe[1]);
    execvp(argv[0], argv.data());
    _exit(127);
  }

  if (pid < 0) {
    close(out_pipe[0]);
    close(out_pipe[1]);
    close(err_pipe[0]);
    close(err_pipe[1]);
    result.spawn_failed = true;
    return result;
  }

  close(out_pipe[1]);
  close(err_pipe[1]);
  fcntl(out_pipe[0], F_SETFL, fcntl(out_pipe[0], F_GETFL, 0) | O_NONBLOCK);
  fcntl(err_pipe[0], F_SETFL, fcntl(err_pipe[0], F_GETFL, 0) | O_NONBLOCK);

  const std::size_t kOutCap = 16u * 1024u * 1024u;
  const std::size_t kErrCap = 64u * 1024u;
  bool out_open = true;
  bool err_open = true;
  const auto deadline =
      std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);
  char buf[65536];

  auto drain = [&](int fd, std::string& dst, std::size_t cap, bool& open_flag) {
    for (;;) {
      const ssize_t n = read(fd, buf, sizeof(buf));
      if (n > 0) {
        if (dst.size() < cap) {
          dst.append(buf, std::min(static_cast<std::size_t>(n), cap - dst.size()));
        }
        continue;
      }
      if (n == 0) {
        close(fd);
        open_flag = false;
        return;
      }
      if (errno == EINTR) continue;
      if (errno == EAGAIN || errno == EWOULDBLOCK) return;
      close(fd);
      open_flag = false;
      return;
    }
  };

  while (out_open || err_open) {
    struct pollfd fds[2];
    int count = 0;
    if (out_open) {
      fds[count].fd = out_pipe[0];
      fds[count].events = POLLIN;
      fds[count].revents = 0;
      ++count;
    }
    if (err_open) {
      fds[count].fd = err_pipe[0];
      fds[count].events = POLLIN;
      fds[count].revents = 0;
      ++count;
    }
    const int ready = poll(fds, static_cast<nfds_t>(count), 50);
    if (ready < 0 && errno != EINTR) break;
    if (out_open) drain(out_pipe[0], result.out, kOutCap, out_open);
    if (err_open) drain(err_pipe[0], result.err, kErrCap, err_open);
    if (std::chrono::steady_clock::now() >= deadline) {
      kill(pid, SIGKILL);
      result.timed_out = true;
      break;
    }
  }

  if (out_open) close(out_pipe[0]);
  if (err_open) close(err_pipe[0]);

  int status = 0;
  while (waitpid(pid, &status, 0) < 0 && errno == EINTR) {
  }
  if (WIFEXITED(status)) {
    result.exit_code = WEXITSTATUS(status);
  } else if (WIFSIGNALED(status)) {
    result.exit_code = 128 + WTERMSIG(status);
  }
  if (result.timed_out) result.exit_code = -1;
  return result;
}
#endif  // !defined(_WIN32)

// The outbound exchange is performed by uvp's own `http` tool. That is the
// same operation the uvp MCP server serves, and its TLS path is the one uvp
// ships and tests. This process runs on a libuv worker thread, so waiting for
// the child never blocks the web loop.
void PerformSend(const SavedRequest& in, OutboundResult& out) {
  const auto started = std::chrono::steady_clock::now();

  if (in.body.size() > 512u * 1024u) {
    out.error = "request body exceeds the 512 KiB limit of the outbound bridge";
    return;
  }

  std::string method = in.method;
  std::transform(method.begin(), method.end(), method.begin(),
                 [](unsigned char c) { return static_cast<char>(std::toupper(c)); });

  std::vector<std::string> args;
  args.push_back(g_uvp_bin);
  args.push_back("http");
  args.push_back(method);
  args.push_back(in.url);
  args.push_back("--json");
  args.push_back("--timeout");
  args.push_back(std::to_string(in.timeout_ms));
  if (!in.verify_tls) args.push_back("--no-tls");
  for (const auto& h : in.headers) {
    if (h.first.empty()) continue;
    args.push_back("--header");
    args.push_back(h.first + ": " + h.second);
  }
  if (!in.body.empty()) {
    args.push_back("--data");
    args.push_back(in.body);
  }

  const ProcResult proc = RunProcess(args, in.timeout_ms + 5000);
  out.elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                       std::chrono::steady_clock::now() - started).count();

  if (proc.spawn_failed || (proc.exit_code == 127 && proc.out.empty())) {
    out.error = "could not start '" + g_uvp_bin +
                "' (set UVP_BIN to the uvp executable)";
    return;
  }
  if (proc.timed_out) {
    out.error = "timed out after " + std::to_string(in.timeout_ms + 5000) + " ms";
    return;
  }
  if (proc.out.empty()) {
    out.error = "uvp returned no output";
    if (!proc.err.empty()) out.error += ": " + proc.err;
    return;
  }

  uvcpp_json doc = uvcpp_json::parse(proc.out, nullptr, false);
  if (doc.is_discarded() || !doc.is_object()) {
    out.error = "uvp returned an unreadable response";
    if (!proc.err.empty()) out.error += ": " + proc.err;
    return;
  }

  if (doc.contains("status") && doc["status"].is_number_integer()) {
    out.ok = true;
    out.status = doc["status"].get<int>();
    if (doc.contains("status_text") && doc["status_text"].is_string()) {
      out.status_text = doc["status_text"].get<std::string>();
    }
    if (doc.contains("headers") && doc["headers"].is_object()) {
      for (auto it = doc["headers"].begin(); it != doc["headers"].end(); ++it) {
        out.headers.push_back(std::make_pair(
            it.key(),
            it.value().is_string() ? it.value().get<std::string>() : it.value().dump()));
      }
    }
    if (doc.contains("body") && doc["body"].is_object()) {
      const uvcpp_json& body = doc["body"];
      if (body.contains("text") && body["text"].is_string()) {
        out.body = body["text"].get<std::string>();
      }
    }
    if (doc.contains("timing") && doc["timing"].is_object()) {
      const uvcpp_json& timing = doc["timing"];
      if (timing.contains("total_ms") && timing["total_ms"].is_number()) {
        out.elapsed_ms = static_cast<long long>(timing["total_ms"].get<double>());
      }
    }
    return;
  }

  out.error = doc.value("message", std::string("uvp reported an error"));
  if (doc.contains("code") && doc["code"].is_string()) {
    out.error = doc["code"].get<std::string>() + ": " + out.error;
  }
  if (out.error.empty()) out.error = "uvp reported an error without a message";
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
  g_uvp_bin = ResolveUvpBinary();

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
            << "\n  outbound engine: " << g_uvp_bin << " http --json\n"
            << std::flush;
  app.join();
  return 0;
}
