import type { ProxmoxVmModel } from "../src/proxmox/model";
import type { LifecycleActionId } from "../src/infrastructure/model";
const GB = 1e9;
const running: ProxmoxVmModel = {
  identity: {
    name: "Home Assistant",
    vmId: 104,
    node: "pve01",
    deviceId: "fixture-device-104",
  },
  state: "running",
  capabilities: {
    cpu: "available",
    memory: "available",
    disk: "available",
    networkRx: "available",
    networkTx: "available",
    uptime: "available",
  },
  metrics: {
    cpu: { value: 42, unit: "percent", availability: "available" },
    memory: {
      value: 6.2 * GB,
      total: 16 * GB,
      percentage: 38.75,
      unit: "bytes",
      availability: "available",
    },
    disk: {
      value: 37 * GB,
      total: 100 * GB,
      percentage: 37,
      unit: "bytes",
      availability: "available",
    },
    networkRx: { value: 4.2 * GB, unit: "bytes", availability: "available" },
    networkTx: { value: 780e6, unit: "bytes", availability: "available" },
    uptime: {
      value: (4 * 24 + 7) * 3600,
      unit: "seconds",
      availability: "available",
    },
  },
  actions: (
    [
      "start",
      "shutdown",
      "reboot",
      "force-stop",
      "suspend",
      "resume",
    ] as LifecycleActionId[]
  ).map((id) => ({ id, capability: "available" })),
};
export const fixtures: Record<string, ProxmoxVmModel> = {
  "Running healthy": running,
  Stopped: {
    ...running,
    state: "stopped",
    identity: { ...running.identity, name: "Development server" },
    metrics: {
      ...running.metrics,
      cpu: { value: 0, unit: "percent", availability: "available" },
    },
  },
  Suspended: {
    ...running,
    state: "suspended",
    identity: { ...running.identity, name: "Build worker" },
  },
  "One unavailable metric": {
    ...running,
    metrics: {
      ...running.metrics,
      memory: { value: null, unit: "bytes", availability: "unavailable" },
    },
  },
  "Unavailable VM": { ...running, state: "unavailable" },
  "Missing optional metrics": {
    ...running,
    capabilities: {
      ...running.capabilities,
      disk: "missing",
      networkRx: "disabled",
      networkTx: "missing",
    },
  },
  "Unknown state": { ...running, state: "unknown" },
};
