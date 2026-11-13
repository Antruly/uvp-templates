# Admin Workbench Skin 1.0.0

A reusable Vue 3 presentation package for product consoles. It contains a responsive application shell, collapsible desktop sidebar, mobile drawer navigation, breadcrumb header, sample overview/projects/reports pages, appearance settings, five accent colors, and browser-persisted preferences.

This package is a frontend skin and interaction scaffold. It does not include authentication, authorization, business APIs, a database, or backend service code. Replace the sample data in `files/frontend/src/views/` with your application's data.

## Use

Import the package, then copy `files/frontend/` into a generated workspace. From that directory:

```sh
npm ci
npm run dev
npm run typecheck
npm run build
```

The package is self-contained and does not require uvp at runtime. Browser local storage saves the sidebar width, appearance, and accent selection. Select `System` under settings to follow the operating-system color preference.

## Source and licence

The layout conventions were informed by public MIT-licensed projects from Antruly: UvNVR, UvScope, moLink, and moLink Server. This package's UI implementation is original and does not copy their source files. Desk2ONVIF and private repositories were excluded from the source basis. The package is distributed under MIT; see `LICENSE`.

AI-assisted: yes  
Human owner: @Antruly
