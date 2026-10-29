# Hostinger deployment

Thrifty uses an Express server plus a Vite frontend. Deploy it as **Express / Node.js**, not a static-only Vite app, so `/api` remains available.

## Build and startup

- Repository: `robs46859-eng/thrifty`, branch `main`.
- Node.js: 22 or 24 (minimum 22.12).
- Package manager: npm.
- Build script: `build` (`npm run build`).
- Server entry file: `server.cjs`, relative to the repository root.
- Static files remain in `dist/`, served by Express; keep the server application at the repository root.
- Outside Hostinger, `npm start` runs the same compiled server.

The build generates a CommonJS server bundle because Hostinger may load server entry files with `require()`. It does not need a TypeScript runtime loader. The runtime regression check verifies that the compiled entry can be required and starts exactly one listener. Build output is excluded from Git and regenerated on deployment.

## Server environment

For the deployment at `worklifelm.com`:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
APP_ORIGIN=https://worklifelm.com
VISION_PROVIDER=manual
```

Let the hosting platform supply its port when applicable. `APP_ORIGIN` is the exact browser origin used by the same-origin API guard. The `www` alias redirects to the configured apex origin. Configure HTTPS at the host before relying on camera/PWA features.

The initial public deployment is manual-only. No AI key was supplied with this deployment. The app retains its existing local/device storage model; it does not add customer accounts, server-side inventory storage or marketplace connections.

Before activating paid cloud identification publicly, implement authenticated user access and per-user quotas. The current API has a per-process limiter, not account authorization or durable usage billing. Keep all provider keys in server environment variables, never in frontend variables or committed files. Replacing Hostinger's environment variable set deletes omitted keys, so read the configured key names and preserve the full intended set when making changes.

## Verify a release

1. Wait for Hostinger's build to complete.
2. Check HTTPS on apex and `www`; check the alias redirects to apex.
3. Request `/api/health` and confirm `service: thrifty`, `status: ok` and the expected `sourceId`.
4. Confirm `/api/status` reports the intended identification provider, device-only storage and disconnected marketplaces.
5. Compare served HTML, JavaScript, CSS, icons, manifest and service worker with the release build.
6. Exercise a sample and uploaded photo, review/save an item, navigate household/merchant workspaces and verify reload persistence. Check offline reopening and external API fallback as applicable.

`sourceId` is a stable hash of the shipped application sources and build inputs, allowing local and hosted artifacts to be compared even without Git metadata on the server. Health is a process/artifact check; it is not evidence that external AI or marketplace services work.

See [validation scope](VALIDATION.md) and [integration boundaries](ARCHITECTURE.md) for what remains outside this deployment.
