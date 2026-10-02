# Proxmox Cards for Home Assistant

A polished set of Lit/TypeScript infrastructure cards. The first component is `custom:proxmox-vm-card`.

**Early development:** live readings now come from the official Home Assistant Proxmox VE integration through device and entity registries. Lifecycle buttons invoke official integration button entities through HA. By default, shutdown, reboot, suspend, and Force Stop require confirmation; Start and Resume execute directly. The visual editor can change this policy. This is not a release or a HACS installation guide.

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
- `src/ha/`: registry WebSocket controller, subscription cleanup, retry handling, and HA boundary types.
- `src/proxmox/official-adapter.ts`: strict official device/entity discovery and runtime normalization.
- `src/card/`: validated device-first configuration and the Lit renderer. It consumes normalized data and uses HA theme variables with standalone fallbacks.
- `src/index.ts`: custom-element registration and production entry.
- `dev/`: fixtures and standalone harness; never included in the production module.
- `tests/`: formatter, capability/action policy, configuration, and DOM presentation tests.

The renderer exposes a normalized `model` property as its internal adapter boundary. Fixture injection belongs exclusively to the harness; there is no fixture/demo YAML API. The official integration adapter resolves the configured VM device through registry metadata and exact semantic keys, with optional explicit sensor overrides, and feeds this boundary. It never matches friendly names. The editor enables required disabled entities only after an explicit administrator click.

### Visual configuration

In dashboard edit mode, choose **Add card → Proxmox VM Card**, select an official Proxmox VE VM device, review the preview, and save. No YAML or sensor IDs are required. The initial empty card asks you to select a VM; it never chooses one automatically. The adapter rejects nodes, containers, templates, deleted devices, and unrelated integrations.

The editor uses Home Assistant forms/selectors inside a small Lit wrapper. General controls include device, title, layout, icon, and state accent. Metrics controls include visibility of CPU/memory/disk/network, memory/disk percentages, and independent progress bars. Actions controls include visibility of all six lifecycle actions and ordinary footer feedback. Errors always remain visible. Confirmations are independent of visibility and availability; Force Stop stays in overflow.

Under **Advanced**, discovery diagnostics distinguish available, unavailable, disabled, missing, and overridden capabilities and show their entity IDs. Optional sensor overrides retain the same-device, sensor-domain, official-integration checks; clearing an override restores automatic discovery.

When a visible metric needs disabled entities, the editor lists exactly which entities are needed. An administrator can explicitly enable that feature through Home Assistant's entity-registry WebSocket API. Only required entities are changed, including the smallest usable memory dependency path. Partial failures and authorization errors are shown; non-administrators receive instructions to use the VM device page or ask an administrator. Discovery refreshes after enabling. During an integration reload, unavailable placeholders are displayed until actual readings return.

New optional configuration fields (omission preserves existing defaults):

```yaml
title: My VM
metrics:
  cpu: false
  network: false
actions:
  reboot: false
confirm:
  - shutdown
  - reboot
  - force-stop
  - suspend
```

All metrics and actions default visible, subject to discovered capabilities and VM state. `confirm: []` disables all confirmations; add `start` or `resume` to require those confirmations. Title affects presentation only. Existing fields and boolean `progress_bars` configurations remain supported; the editor omits default values where practical. Unknown options, invalid map keys/values, and malformed confirmation lists are rejected.

Minimal live YAML:

```yaml
type: custom:proxmox-vm-card
device: <home-assistant-device-id>
```

Appearance fields: `layout` (`compact`, `standard`, default, or `detailed`), `progress_bars` (boolean or independent `cpu`/`memory`/`disk` booleans), `memory_percentage`, `disk_percentage`, `state_accent`, and `icon` (`mdi:` name). Bars and optional percentages default on. CPU always displays a percentage. In HA, the configured icon uses `ha-icon`; the standalone harness uses a built-in monitor SVG fallback.

Stopped and suspended VMs collapse CPU, memory, disk, and network sections entirely; telemetry returns when the VM runs again. Unavailable running readings retain their placeholders.

Network values are decimal SI cumulative totals, never rates. Running status displays uptime with an accessible “Running” label; the other states have explicit text. Force Stop is separated inside a native keyboard-accessible overflow disclosure. Live lifecycle controls display pending, accepted, or error feedback; the fixture harness remains inert.

## Deferred

HACS/release packaging, licensing, additional cards. No direct Proxmox communication, cloud calls, or telemetry. 

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

`npm run build:ha-preview` creates **`dist-dev/proxmox-vm-test-card.js`**, a separate development-only resource. It registers `custom:proxmox-vm-test-card`, supplying fixtures to the unchanged production renderer. `dev/ha-test-dashboard.yaml` contains compact, standard, and detailed views with all fixture scenarios. The fixture tag stays isolated from live discovery. The same development bundle also registers `custom:proxmox-vm-live-test-card`, a live adapter wrapper for testing alongside an already installed production card. The live tag invokes lifecycle actions; the fixture tag stays inert. It is excluded from the production build.

For this test resource, copy the bundle to `/config/www/proxmox-cards-test/proxmox-vm-test-card.js`, register `/local/proxmox-cards-test/proxmox-vm-test-card.js` as a JavaScript module in HA dashboard resources, and paste the test dashboard YAML into a separate dashboard's raw configuration editor.

### Live data behavior

Select the device ID of a **VM** belonging to the official `proxmoxve` integration. Discovery requires the integration's VM identifier, its parent node association, and exact semantic entity unique IDs. Templates, containers, unrelated integrations, conflicting metadata, and ambiguous matches are rejected with a visible error and retry button. Registry changes trigger rediscovery; normal HA state updates refresh readings without fetching registries again.

Disabled or missing optional entities are omitted. Enabled entities with unavailable or invalid readings retain their unavailable placeholders. If raw memory is disabled or absent, enabled memory percentage and total sensors can supply derived usage. A configured raw memory override takes precedence; it never falls back silently to derived readings. Byte units are normalized to bytes, percentages validated, and duration or uptime timestamp sensors normalized to seconds. An unavailable VM masks retained readings.

Optional `entities` overrides use sensor IDs from the same official VM device. Supported roles: `cpu`, `memory`, `memoryTotal`, `memoryPercentage`, `disk`, `diskTotal`, `networkRx`, `networkTx`, `uptime`, `status`.

```yaml
type: custom:proxmox-vm-card
device: <home-assistant-device-id>
layout: standard
entities:
  cpu: sensor.your_explicit_cpu_entity
```

The integration's `pause` button represents RAM suspension; `hibernate` is not mapped to Suspend. The live controller revalidates device, VM state, and button availability before calling HA’s `button.press` service. It blocks duplicate clicks, surfaces permission failures, and waits for HA state updates rather than optimistically changing VM status.

### Local HA paused-status fix

`tools/ha-proxmox-paused-status.py` is a reversible installer for a local override of HA's bundled official `proxmoxve` integration. Run it with `python ... --install` inside the HA container. It retains the integration's domain, entities, and connection settings, fetches `/status/current` for each running VM on every integration poll, and maps QEMU `paused`/`suspended` to HA `suspended`. Failed status queries fail the refresh instead of publishing a misleading running state. This adds one API request per running VM per poll.

The deployed override lives at `/config/custom_components/proxmoxve`, with the original source snapshot at `/config/proxmox-cards-patches/proxmoxve-bundled-before-paused-fix`. Restart HA to activate it. **Review or remove the override after HA upgrades**, since custom components take precedence over bundled updates. Roll back by moving the override out of `custom_components` and restarting HA; the bundled integration then loads again. The installer refuses to overwrite an existing override or patch an unexpected source layout.

Run its isolated logic tests with `python3 tools/test_ha_proxmox_paused_status.py`. No card-side Proxmox connections or credentials are introduced.

Accepted lifecycle request feedback clears when HA reports a different VM status or a reboot resets uptime, including when that update arrives before the service response. Other metric updates retain the waiting message.

Set `show_action_status: false` to hide the footer's normal lifecycle and request feedback (default: `true`). Action errors always remain visible, labeled “Last occurred error,” regardless of this setting.

### Card tap, hold and double tap

The visual editor's **Card interactions** section configures `tap_action`, `hold_action`, and `double_tap_action` using Home Assistant action selectors. Supported actions are More info, Navigate, Open URL, Perform action (including legacy call-service), Toggle, Fire DOM event, and None. More info defaults to the VM status sensor (CPU if status is absent); select an entity to override it. Tap defaults to More info; hold and double tap default to None. Lifecycle buttons and overflow never trigger these surface gestures. Scrolling cancels a hold, and a double tap suppresses the single tap. Enter/Space on the focused card executes the tap action. Gesture service failures remain visible as errors.

```yaml
tap_action:
  action: more-info
hold_action:
  action: navigate
  navigation_path: /proxmox-cards-test/live
double_tap_action:
  action: none
```

Gesture confirmations are independent of lifecycle confirmations. Configuring Perform action can invoke arbitrary HA services with your current HA permissions.
