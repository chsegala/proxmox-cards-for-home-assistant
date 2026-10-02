# Proxmox Cards for Home Assistant

A Home Assistant card for monitoring and controlling QEMU VMs through the **official Home Assistant Proxmox VE integration**.

Local-first: Home Assistant remains the backend. The card has no cloud backend or telemetry and never connects directly to Proxmox.

**Status:** the VM card's monitoring, lifecycle controls and visual editor are implemented. This repository is in development; HACS packaging and public releases are not available yet. Try it through the fixture harness or a separate HA test dashboard before using it for important VMs.

## Features

- Device-first configuration and automatic official-integration discovery.
- CPU, RAM, disk, cumulative network totals and running uptime.
- Compact, standard and detailed layouts; responsive sizing and HA light/dark themes.
- Start, Shutdown, Reboot, Suspend, Resume and separate Force Stop controls, subject to HA capability/state/permissions.
- Configurable confirmations, metric/action visibility and tap/hold/double-tap actions.
- Visual editor, explicit administrator onboarding for disabled metrics, advanced discovery diagnostics and safe sensor overrides.
- Unavailable placeholders and action errors; stopped/suspended VMs collapse telemetry.

## Screenshots

Screenshots belong in [docs/images](docs/images/README.md). The fixture harness provides representative running, stopped, suspended, unavailable and loading views. Deployment screenshots must be reviewed for private names, identifiers and URLs before committing.

## Requirements

- Home Assistant with the **official `proxmoxve` integration** configured.
- A QEMU VM device; LXC, nodes, storage and custom/HACS Proxmox integrations are not supported by this card.
- Browser support for current Home Assistant frontend components. A minimum HA version has not yet been established for a release.

Some bundled Home Assistant versions may report suspended QEMU VMs as running. The optional local workaround in `tools/ha-proxmox-paused-status.py` changes the integration and requires review after Home Assistant upgrades; it is not installed by the card.

## Configuration

Once the development resource is registered, choose **Add card → Proxmox VM Card** in dashboard edit mode. Select a VM and configure it visually; normal setup requires no YAML or sensor IDs.

Minimal YAML:

```yaml
type: custom:proxmox-vm-card
device: <home-assistant-device-id>
```

Optional settings:

```yaml
type: custom:proxmox-vm-card
device: <home-assistant-device-id>
title: Development VM
layout: detailed
icon: mdi:desktop-tower
state_accent: true
metrics:
  network: false
progress_bars:
  disk: false
memory_percentage: true
disk_percentage: true
actions:
  suspend: false
show_action_status: false
confirm:
  - shutdown
  - reboot
  - force-stop
  - suspend
tap_action:
  action: more-info
hold_action:
  action: navigate
  navigation_path: /my-dashboard/vms
double_tap_action:
  action: none
```

Omitted settings preserve product defaults. Metrics/actions default visible where discovered and usable. CPU always shows a percentage. Bars and memory/disk percentages default on. `progress_bars` also accepts a boolean. `confirm: []` removes confirmations; Start/Resume can be added. Force Stop remains in overflow. Errors remain visible even when ordinary action feedback is hidden.

Tap defaults to VM status More info (CPU as fallback); hold/double tap default to None. Gesture actions include navigation, URL, HA action/service, toggle and custom DOM events. Service actions execute with the current HA user's permissions; their confirmations are independent of lifecycle policy. Lifecycle controls do not trigger surface gestures.

**Advanced** exposes discovered IDs/statuses and optional `entities` sensor overrides for CPU, memory/total/percentage, disk/total, network RX/TX, uptime and status. Overrides must belong to the selected official VM device. Clearing an override restores automatic discovery.

When a configured metric requires disabled entities, the editor lists exactly what is needed. Only an explicit administrator click enables them. Partial/permission failures are shown; HA reloads can temporarily make readings unavailable. No values are fabricated during reload. Raw memory can be derived from enabled percentage and total sensors when raw usage is absent/disabled.

Network readings are decimal SI cumulative totals, not throughput. Actual disk semantics depend on HA's integration readings; the card does not query guest filesystems.

## Architecture

```text
Proxmox
  ↓
Home Assistant Proxmox VE integration
  ↓
HA device/entity registry and state
  ↓
Official adapter → normalized VM model → Proxmox VM Card
```

The card does not connect directly to Proxmox. Registry discovery, lifecycle/service interaction, normalized models, editor and presentation retain separate responsibilities. Discovery uses device metadata and exact semantic IDs, never fuzzy names.

## Development / manual testing

Requires Node.js **22.12+** and npm.

```sh
npm install
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
npm run build:ha-preview
python3 tools/test_ha_proxmox_paused_status.py
```

The local fixture harness is deterministic and its power controls are inert. Switch layouts/themes and resize it. Production builds create `dist/proxmox-vm-card.js`, a self-contained module including Lit; fixtures are excluded.

For manual HA testing, copy that bundle to `/config/www/proxmox-vm-card/proxmox-vm-card.js` and register `/local/proxmox-vm-card/proxmox-vm-card.js` as a JavaScript module under dashboard resources. Use a separate test dashboard, refresh the resource URL version when rebuilding, and reload the browser. This is a development workflow, not a production release mechanism.

The separate `build:ha-preview` bundle registers inert fixture and live test tags. The fixture dashboard is in `dev/ha-test-dashboard.yaml`. Real lifecycle testing requires a disposable VM.

See [CONTRIBUTING](CONTRIBUTING.md) and [SECURITY](SECURITY.md).

## Status / roadmap

Implemented: QEMU VM monitoring/discovery, lifecycle controls, configuration/onboarding, diagnostics and surface gestures.

Deferred: HACS/public releases, Node/LXC/Storage/Cluster cards, history, throughput, backups and snapshots. No dates or commitment to future features are implied.

## License and independence

Repository code, foundation, adapters, editor, harness and tooling are licensed under [Apache-2.0](LICENSE). Third-party dependencies retain their own licenses. npm publication stays disabled (`private: true`).

This project is an independent community project and is not affiliated with or endorsed by Proxmox Server Solutions GmbH or the Home Assistant project.
