cmake_minimum_required(VERSION 3.20)
project({{project.name}} LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Modules requested at generation time. libuvcpp has to have been built with
# these on; if you are building it from source, configure it with:
#
#   cmake -S libuvcpp -B build-libuvcpp \
#     -DUVCPP_BUILD_WEB=ON \
#     -DUVCPP_BUILD_WEBAPP=ON \
#     -DCMAKE_INSTALL_PREFIX=/path/to/prefix
#
set(UVP_REQUESTED_FEATURES websocket)

# libuvcpp is found two ways, because it ships two ways and neither covers the
# other:
#
#   - `cmake --install` writes a package config (lib/cmake/uvcpp), so
#     `find_package(uvcpp)` works and yields the namespaced target
#     `uvcpp::uvcpp`.
#   - The prebuilt release archives ship pkg-config and *no* CMake config file,
#     so for those the only way in is `uvcpp.pc`.
#
# The version floor is enforced on both routes. It is deliberately a floor and
# not a pin: libuvcpp follows semver and the generated code uses API that has
# been stable across the 1.x line.
#
# Point UVCPP_ROOT or CMAKE_PREFIX_PATH at an unpacked release if it is not
# installed in a standard prefix.
find_package(uvcpp 1.7.0 CONFIG QUIET)

if(uvcpp_FOUND)
  set(UVP_UVCPP_TARGET uvcpp::uvcpp)
  set(UVP_UVCPP_ROUTE "CMake package (${uvcpp_DIR})")
else()
  find_package(PkgConfig REQUIRED)
  pkg_check_modules(UVCPP REQUIRED IMPORTED_TARGET "uvcpp>=1.7.0")
  set(UVP_UVCPP_TARGET PkgConfig::UVCPP)
  set(UVP_UVCPP_ROUTE "pkg-config (${UVCPP_VERSION})")
endif()

message(STATUS "uvp: libuvcpp via ${UVP_UVCPP_ROUTE}")

add_executable({{project.name}}
  src/main.cpp
)

# The manifest names the executable, and uvp resolves it as build/<name>.
# Multi-configuration generators (Visual Studio, Xcode) would otherwise append a
# per-configuration directory and put it in build/Debug/<name>, so the project
# would build and then not be startable by the tool that generated it. The base
# property covers single-configuration generators; the per-configuration
# properties override its configuration subdirectory on multi-config ones.
set_target_properties({{project.name}} PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}")
foreach(uvp_config ${CMAKE_CONFIGURATION_TYPES})
  string(TOUPPER "${uvp_config}" uvp_config_upper)
  set_target_properties({{project.name}} PROPERTIES
    "RUNTIME_OUTPUT_DIRECTORY_${uvp_config_upper}" "${CMAKE_BINARY_DIR}")
endforeach()

target_link_libraries({{project.name}} PRIVATE ${UVP_UVCPP_TARGET})

if (MSVC)
  # MSVC reads a source without a BOM in the system code page. On a Chinese
  # Windows install that is GBK (936), so a UTF-8 source with Chinese comments or
  # string literals is decoded as GBK and fails to compile. The generated sources
  # are UTF-8, so /utf-8 tells the compiler both the source and execution
  # charsets are UTF-8; a source that does carry a BOM still compiles the same
  # way, and GCC and Clang already default to UTF-8 in the branch below.
  target_compile_options({{project.name}} PRIVATE /W4 /permissive- /utf-8)
else()
  target_compile_options({{project.name}} PRIVATE -Wall -Wextra -Wpedantic)
endif()
