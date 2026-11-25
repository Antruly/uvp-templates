#include <uvcpp/uvcpp_config.h>
#if !UVCPP_WEBAPP_ENABLE || !UVCPP_WEB_STATIC_ENABLE
#error "request-inspector needs libuvcpp WebApp and static serving"
#endif
#include <webapp/uvcpp_web_app.h>
#include <webapp/uvcpp_web_request.h>
#include <webapp/uvcpp_web_response.h>
#include <nlohmann/json.hpp>
#include <algorithm>
#include <iostream>
#include <string>
using namespace uvcpp;

int main() {
  uvcpp_web_app app;
  app.set_port({{project.port}});
  app.get("/healthz", [](uvcpp_web_request&, uvcpp_web_response& response, uvcpp_web_next) {
    response.status(200).json_str(R"({"status":"ok"})");
    response.end();
  });
  app.post("/api/inspect", [](uvcpp_web_request& request, uvcpp_web_response& response, uvcpp_web_next) {
    constexpr size_t limit = 4096;
    const std::string body = request.body_str();
    size_t end = std::min(body.size(), limit);
    // Do not split a UTF-8 code point when a valid input crosses the limit.
    if (end < body.size()) {
      while (end > 0 && (static_cast<unsigned char>(body[end]) & 0xc0) == 0x80) --end;
    }
    const std::string content_type = request.header("content-type");
    nlohmann::json result = {
      {"method", request.method_name()},
      {"content_type", content_type},
      {"body_bytes", body.size()}, {"preview_limit_bytes", limit},
      {"preview_source_bytes", end}, {"truncated", end < body.size()},
      {"body_preview", body.substr(0, end)},
      {"encoding", "UTF-8; invalid sequences replaced with U+FFFD"}
    };
    response.status(200).json_str(result.dump(-1, ' ', false, nlohmann::json::error_handler_t::replace));
    response.end();
  });
  app.serve_static("/", "./public");
  const int rc = app.start();
  if (rc != 0) { std::cerr << "failed to listen: " << rc << '\n'; return 1; }
  std::cout << "listening on " << app.bound_port() << '\n' << std::flush;
  app.join();
  return 0;
}
