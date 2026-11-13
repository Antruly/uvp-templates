#include <uvcpp/uvcpp_config.h>

#if !defined(UVCPP_WEBAPP_ENABLE) || !UVCPP_WEBAPP_ENABLE
#error "admin-console requires libuvcpp built with UVCPP_BUILD_WEBAPP=ON"
#endif

#include <webapp/uvcpp_web_app.h>
#include <webapp/uvcpp_web_request.h>
#include <webapp/uvcpp_web_response.h>
#include <webapp/uvcpp_web_static.h>

#include <iostream>

using namespace uvcpp;

int main() {
  uvcpp_web_app app;
  app.set_port({{project.port}});

  app.get("/healthz", [](uvcpp_web_request&, uvcpp_web_response& response, uvcpp_web_next) {
    response.status(200).json_str(R"({"status":"ok"})");
    response.end();
  });
  app.get("/api/overview", [](uvcpp_web_request&, uvcpp_web_response& response, uvcpp_web_next) {
    response.status(200).json_str(R"({"service":"admin-console","status":"ready","items":3})");
    response.end();
  });

  uvcpp_web_static_options options;
  options.spa_fallback = true;
  app.serve_static("/", "./frontend/dist", options);

  const int rc = app.start();
  if (rc != 0) {
    std::cerr << "failed to start on port {{project.port}}: libuv error " << rc << "\n";
    return 1;
  }
  std::cout << "listening on " << app.bound_port() << "\n" << std::flush;
  app.join();
  return 0;
}
