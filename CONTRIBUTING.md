# Contributing

Use Node.js 22.12+ and `npm install`. Start the fixture harness with `npm run dev`; its lifecycle controls are inert.

Before submitting a change, run:

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run build:ha-preview
python3 tools/test_ha_proxmox_paused_status.py
npm run format:check
```

Behavior changes require meaningful regression tests; UI changes should include screenshots without private deployment information. Update user documentation when behavior changes. Only use a disposable VM for live lifecycle testing.

Preserve the HA-only backend, device-first discovery, exact semantic matching (no fuzzy entity-name discovery), and normalized models separated from presentation. Never introduce direct Proxmox calls, telemetry or cloud services. Do not add dependencies casually. Discuss large architectural changes before implementation.

For unsupported integrations, report the integration name, version and sanitized registry diagnostics in an issue; do not patch discovery with naming heuristics. Never include credentials, cookies or private keys. Follow SECURITY.md for vulnerabilities.

## Releases

The build workflow validates pushes and pull requests. To publish, update `package.json` and the lockfile together, then push a `v`-prefixed tag matching that version. After all checks pass, the workflow publishes the card bundle and license files to GitHub Releases and validates the HACS package. A prerelease version/tag publishes a GitHub prerelease. The production bundle includes the license notices; development fixtures and integration-workaround scripts are excluded from release assets.
