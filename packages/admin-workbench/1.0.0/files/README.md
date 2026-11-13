# Admin Workbench

This folder is copied into the generated workspace as a standalone Vue 3 frontend. It has no runtime dependency on uvp or a backend service.

```sh
cd frontend
npm ci
npm run dev
npm run typecheck
npm run build
```

Replace the sample workspace, project, report, and profile data in `src/views/` with application data. The browser stores sidebar width, appearance, and accent selection in local storage. The `system` appearance follows the current operating-system preference when selected.
