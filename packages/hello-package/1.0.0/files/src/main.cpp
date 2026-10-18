#include <webapp/uvcpp_web_app.h>
#include <webapp/uvcpp_web_request.h>
#include <webapp/uvcpp_web_response.h>

#include <iostream>
#include <string>

#if !UVCPP_WEB_ENABLE
#  error "This service needs libuvcpp built with websocket support (UVCPP_WEB_ENABLE is 0)."
#endif
#if !UVCPP_WEBAPP_ENABLE
#  error "This service needs libuvcpp built with websocket support (UVCPP_WEBAPP_ENABLE is 0)."
#endif

using namespace uvcpp;

// A single route, wired by hand. Everything uvp generates ends up looking like
// this: ordinary libuvcpp code that a C++ developer would recognise.
//
// The handler takes a third parameter, next. Leaving it uncalled and ending the
// response is the normal case; calling it would pass the request on to the next
// matching handler.
int main() {
  uvcpp_web_app app;
  app.set_port({{project.port}});

  app.get("/hello", [](uvcpp_web_request&, uvcpp_web_response& resp, uvcpp_web_next) {
    resp.status(200).json_str(R"({"message":"Hello, AI"})");
    resp.end();
  });

  const int rc = app.start();
  if (rc != 0) {
    std::cerr << "failed to start on port {{project.port}}: libuv error " << rc << "\n";
    return 1;
  }

  std::cout << "listening on " << app.bound_port() << "\n" << std::flush;
  app.join();
  return 0;
}
