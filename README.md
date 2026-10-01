# Proxmox Cards for Home Assistant

A polished set of Lit/TypeScript infrastructure cards. The first component is `custom:proxmox-vm-card`.

**Early development:** this version provides a static, normalized-model renderer and a standalone fixture harness. Device discovery and lifecycle calls are not connected. Preview lifecycle buttons are disabled. Loading this module in Home Assistant alone will show “Waiting for VM data.” This is not a release or a HACS installation guide.

## Development

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The harness includes running, stopped, suspended, unavailable metric, unavailable VM, missing optional metrics, unknown state, and loading examples. Switch layouts, bars, percentages, and theme with its controls. Resize the viewport to check narrow cards.

```sh
npm run build
npm test
npm run lint
npm run typecheck
npm run format:check
```

Build outputs **`dist/proxmox-vm-card.js`**, a single self-contained ES module including Lit, with no runtime CDN imports. The harness and fixtures are outside the production import graph. No Home Assistant frontend checkout is required.

## Architecture

- `src/infrastructure/`: domain-neutral metric/capability/state/action types, action policy, and SI-byte/percentage/uptime formatters.
- `src/proxmox/model.ts`: VM identity and normalized model; capability resolution distinguishes absent metrics from unavailable readings and masks stale readings for unavailable VMs.
- `src/card/`: validated device-first configuration and the Lit renderer. It consumes normalized data and uses HA theme variables with standalone fallbacks.
- `src/index.ts`: custom-element registration and production entry.
- `dev/`: fixtures and standalone harness; never included in the production module.
- `tests/`: formatter, capability/action policy, configuration, and DOM presentation tests.

The renderer exposes a normalized `model` property as its internal adapter boundary. Fixture injection belongs exclusively to the harness; there is no fixture/demo YAML API. The future official integration adapter will resolve the configured device through registry metadata, strict semantic matching, then manual overrides, and feed this boundary.

Expected future minimal YAML:

```yaml
type: custom:proxmox-vm-card
device: <home-assistant-device-id>
```

Appearance fields: `layout` (`compact`, `standard`, default, or `detailed`), `progress_bars` (boolean or independent `cpu`/`memory`/`disk` booleans), `memory_percentage`, `disk_percentage`, `state_accent`, and `icon` (`mdi:` name). Bars and optional percentages default on. CPU always displays a percentage. In HA, the configured icon uses `ha-icon`; the standalone harness uses a built-in monitor SVG fallback.

Network values are decimal SI cumulative totals, never rates. Running status displays uptime with an accessible “Running” label; the other states have explicit text. Force Stop is separated inside a native keyboard-accessible overflow disclosure. All lifecycle controls are inert and labeled as previews.

## Deferred

Official Proxmox registry discovery and semantic matching, manual override resolution, HA lifecycle invocation and confirmations, visual editor and authorized entity enabling, HACS/release packaging. No direct Proxmox communication, cloud calls, telemetry, or discovery is implemented. 

## Devcontainer and Kubernetes bastion

`.devcontainer/` provides Node.js 22 and checksum-verified kubectl, running as `node`. Docker Desktop must be running and able to reach your cluster (including its VPN/private network).

Open this repository with **Dev Containers: Reopen in Container** in VS Code, or use the CLI:

```sh
npx --yes @devcontainers/cli up --workspace-folder .
npx --yes @devcontainers/cli exec --workspace-folder . kubectl version --client
npx --yes @devcontainers/cli exec --workspace-folder . npm run dev -- --host 0.0.0.0
```

The CLI harness is available at `http://127.0.0.1:5174`, leaving the host's port 5173 free. Container dependencies live in their own named volume, so Linux and macOS packages do not overwrite each other.

The separate `proxmox-cards-kubeconfig` volume holds `/home/node/.kube/config`. Credentials are never included in the image or checked into Git. To populate it, save your kubeconfig outside this repository, then copy it into the running devcontainer (substitute its ID and your external file path):

```sh
docker cp /path/outside/repo/kubeconfig <container-id>:/home/node/.kube/config
docker exec --user root <container-id> chown node:node /home/node/.kube/config
docker exec --user node <container-id> chmod 600 /home/node/.kube/config
```

Then run `kubectl get pods --all-namespaces` inside the devcontainer to locate Home Assistant. The volume persists across container rebuilds. This is a client bastion: it accesses the existing cluster API; it does not create a cluster. kubectl defaults to `v1.35.0`; adjust `build.args.KUBECTL_VERSION` to within one minor version of your API server and rebuild if needed. Cluster writes and HA installation are separate deployment steps.

### Fixture dashboard in Home Assistant

`npm run build:ha-preview` creates **`dist-dev/proxmox-vm-test-card.js`**, a separate development-only resource. It registers `custom:proxmox-vm-test-card`, supplying fixtures to the unchanged production renderer. `dev/ha-test-dashboard.yaml` contains compact, standard, and detailed views with all fixture scenarios. This module is for visual integration testing only; it has no discovery or working lifecycle actions. It is excluded from the production build.

For this test resource, copy the bundle to `/config/www/proxmox-cards-test/proxmox-vm-test-card.js`, register `/local/proxmox-cards-test/proxmox-vm-test-card.js` as a JavaScript module in HA dashboard resources, and paste the test dashboard YAML into a separate dashboard's raw configuration editor.
