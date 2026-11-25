#include <uvcpp/uvcpp_config.h>
#if !UVCPP_WEBAPP_ENABLE || !UVCPP_WEB_ENABLE || !UVCPP_WEB_WS_ENABLE
#error "websocket-console requires libuvcpp WebApp, Web and WebSocket support"
#endif
#include <webapp/uvcpp_web_app.h>
#include <webapp/uvcpp_web_request.h>
#include <webapp/uvcpp_web_response.h>
#include <web/uvcpp_ws_connection.h>
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
  app.websocket("/ws", [](uvcpp_web_ws_request& request) {
    auto* connection = request.connection();
    if (connection == nullptr) return;
    // libuvcpp owns this connection and invokes callbacks while it is alive.
    connection->on_text([connection](const std::string& text) {
      connection->send_text(text.data(), text.size());
    });
    connection->on_binary([connection](const uint8_t* data, size_t size) {
      connection->send_binary(reinterpret_cast<const char*>(data), size);
    });
  });
  // Start from the generated project root; no frontend build is required.
  app.serve_static("/", "./public");
  const int result = app.start();
  if (result != 0) {
    std::cerr << "failed to listen: " << result << '\n';
    return 1;
  }
  std::cout << "listening on " << app.bound_port() << '\n' << std::flush;
  app.join();
  return 0;
}
