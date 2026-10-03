# Visual capture

Screenshots every mobile screen (light, dark, and the search flow) from the
Expo **web** build, with the whole API mocked by local fixtures — no backend,
database or credentials needed, and nothing is ever sent to a real server.
Use it to review UI changes side by side before and after a change.

```sh
# 1. Web build pointed at the mock host (the harness intercepts it)
cd apps/mobile
API_BASE_URL=http://vaya-mock.test/api/v1 npx expo start --web --port 8081

# 2. Capture (another terminal)
cd tests/e2e
pnpm visual:capture            # -> tests/e2e/visual/output/*.png
```

Environment overrides: `VAYA_WEB` (dev server URL, default
`http://localhost:8081`) and `VAYA_SHOTS` (output folder).

Limits — check these on a device: the web build has no native maps (a grid
placeholder stands in), no native RTL mirroring, and no camera.
Fixtures live in `harness.cjs` (`defaultFixtures`); `open({ fixtures })`
accepts `driver`, `noBookings`, `emptySearch`, `patterns`, `delayMs` (loading
states) and `fail` (a path regex answered with HTTP 500, for error states).
