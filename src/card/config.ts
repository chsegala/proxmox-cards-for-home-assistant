import { validateCardAction, type CardAction } from "./gestures";
import {
  defaultConfirmations,
  type LifecycleActionId,
} from "../infrastructure/model";
import { entityRoles, type EntityOverrides } from "../proxmox/official-adapter";
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
  title?: string;
  tap_action?: CardAction;
  hold_action?: CardAction;
  double_tap_action?: CardAction;
  metrics?: Partial<Record<"cpu" | "memory" | "disk" | "network", boolean>>;
  actions?: Partial<Record<LifecycleActionId, boolean>>;
  confirm?: LifecycleActionId[];
}
export function requiresConfirmation(
  config: VmCardConfig | undefined,
  id: LifecycleActionId,
): boolean {
  return config?.confirm === undefined
    ? defaultConfirmations[id]
    : config.confirm.includes(id);
}
export function validateConfig(config: VmCardConfig, allowSetup = false): void {
  if (
    !config ||
    config.type !== "custom:proxmox-vm-card" ||
    typeof config.device !== "string" ||
    (!config.device.trim() && !allowSetup)
  )
    throw new Error("A Home Assistant device ID is required.");
  for (const name of [
    "tap_action",
    "hold_action",
    "double_tap_action",
  ] as const)
    if (config[name] !== undefined) validateCardAction(config[name], name);
  const allowed = [
    "type",
    "device",
    "layout",
    "entities",
    "progress_bars",
    "memory_percentage",
    "disk_percentage",
    "state_accent",
    "show_action_status",
    "icon",
    "title",
    "tap_action",
    "hold_action",
    "double_tap_action",
    "metrics",
    "actions",
    "confirm",
    "view_layout",
    "grid_options",
    "visibility",
  ];
  for (const key of Object.keys(config))
    if (!allowed.includes(key))
      throw new Error(`Unknown configuration option: ${key}.`);
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
          !(entityRoles as readonly string[]).includes(key) ||
          typeof value !== "string" ||
          !value.startsWith("sensor."),
      ))
  )
    throw new Error(
      "Entity overrides must map supported roles to sensor entity IDs.",
    );
  if (config.title !== undefined && typeof config.title !== "string")
    throw new Error("Title must be a string.");
  for (const [field, keys] of [
    ["metrics", ["cpu", "memory", "disk", "network"]],
    ["actions", Object.keys(defaultConfirmations)],
  ] as const) {
    const value = config[field];
    if (
      value !== undefined &&
      (!value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.entries(value).some(
          ([key, enabled]) =>
            !(keys as readonly string[]).includes(key) ||
            typeof enabled !== "boolean",
        ))
    )
      throw new Error(`${field} must map supported names to booleans.`);
  }
  if (
    config.confirm !== undefined &&
    (!Array.isArray(config.confirm) ||
      config.confirm.some((id) => !Object.hasOwn(defaultConfirmations, id)) ||
      new Set(config.confirm).size !== config.confirm.length)
  )
    throw new Error(
      "Confirm must be a list of unique supported lifecycle action names.",
    );
  const bars = config.progress_bars;
  if (bars !== undefined && typeof bars !== "boolean") {
    if (
      !bars ||
      typeof bars !== "object" ||
      Array.isArray(bars) ||
      Object.entries(bars).some(
        ([key, value]) =>
          !["cpu", "memory", "disk"].includes(key) ||
          typeof value !== "boolean",
      )
    )
      throw new Error("Invalid progress_bars configuration.");
  }
}
