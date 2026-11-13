# Admin Console package

`admin-console@1.0.0` is a neutral Vue 3 + Vite administration interface paired with a plain-CMake libuvcpp HTTP service. It demonstrates a responsive shell, local theme and locale preferences, an overview page, a health endpoint, and static frontend delivery.

Import and generate it with:

```sh
uvp template validate ./admin-console/1.0.0
uvp template import ./admin-console/1.0.0
uvp init ./admin-console-workspace --name admin-console --port 8080 --template-package admin-console@1.0.0
```

Then follow the generated workspace's `README.md`. Build `frontend/` with its committed npm lockfile before starting the C++ service. The installed libuvcpp must have been built with `UVCPP_BUILD_WEBAPP=ON`; the generated source checks `UVCPP_WEBAPP_ENABLE` from the installed configuration header.

The package adapts the application-shell layout, theme preference pattern, and Vue/Vite setup from [UvNVR](https://github.com/Antruly/UvNVR) at revision `1e48bc303b45643ca21da61f788443f931a5930c`, copyright Antruly, under the MIT license. NVR routes, views, stores, models, branding, authentication, authorization, and server-specific API behavior were not copied. The frontend API helper and demonstration screens are newly written for this package.
