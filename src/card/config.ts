import type { EntityOverrides } from "../proxmox/official-adapter";
export type Layout = "compact" | "standard" | "detailed";
export interface VmCardConfig {
  type: "custom:proxmox-vm-card";
  device: string;
  layout?: Layout;
  entities?: EntityOverrides;
  progress_bars?: boolean | Partial<Record<"cpu" | "memory" | "disk", boolean>>;
  memory_percentage?: boolean;
  disk_percentage?: boolean;
  state_accent?: boolean;
  show_action_status?: boolean;
  icon?: string;
}
export function validateConfig(config: VmCardConfig): void {
  if (
    !config ||
    config.type !== "custom:proxmox-vm-card" ||
    typeof config.device !== "string" ||
    !config.device.trim()
  )
    throw new Error("A Home Assistant device ID is required.");
  if (
    config.layout !== undefined &&
    !["compact", "standard", "detailed"].includes(config.layout)
  )
    throw new Error("Layout must be compact, standard, or detailed.");
  for (const key of [
    "memory_percentage",
    "disk_percentage",
    "state_accent",
    "show_action_status",
  ] as const)
    if (config[key] !== undefined && typeof config[key] !== "boolean")
      throw new Error(`${key} must be a boolean.`);
  if (
    config.icon !== undefined &&
    (typeof config.icon !== "string" || !config.icon.startsWith("mdi:"))
  )
    throw new Error("Icon must use an mdi: name.");
  if (
    config.entities !== undefined &&
    (!config.entities ||
      typeof config.entities !== "object" ||
      Array.isArray(config.entities) ||
      Object.entries(config.entities).some(
        ([key, value]) =>
          ![
            "cpu",
            "memory",
            "memoryTotal",
            "memoryPercentage",
            "disk",
            "diskTotal",
            "networkRx",
            "networkTx",
            "uptime",
            "status",
          ].includes(key) ||
          typeof value !== "string" ||
          !value.startsWith("sensor."),
      ))
  )
    throw new Error(
      "Entity overrides must map supported roles to sensor entity IDs.",
    );
  const bars = config.progress_bars;
  if (bars !== undefined && typeof bars !== "boolean") {
    if (
      !bars ||
      typeof bars !== "object" ||
      Object.entries(bars).some(
        ([key, value]) =>
          !["cpu", "memory", "disk"].includes(key) ||
          typeof value !== "boolean",
      )
    )
      throw new Error("Invalid progress_bars configuration.");
  }
}
