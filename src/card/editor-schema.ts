import { entityRoles } from "../proxmox/official-adapter";
import { defaultConfirmations, actionLabels } from "../infrastructure/model";
import type { VmCardConfig } from "./config";

export interface FormField {
  name: string;
  selector?: object;
  type?: string;
  schema?: FormField[];
  title?: string;
  flatten?: boolean;
  required?: boolean;
}
const defaultConfirmationIds = Object.entries(defaultConfirmations)
  .filter(([, enabled]) => enabled)
  .map(([id]) => id);
const boolean = (name: string): FormField => ({
  name,
  selector: { boolean: {} },
});
export const sections: { title: string; schema: FormField[] }[] = [
  {
    title: "General",
    schema: [
      {
        name: "device",
        required: true,
        selector: { device: { filter: { integration: "proxmoxve" } } },
      },
      { name: "title", selector: { text: {} } },
      {
        name: "layout",
        selector: {
          select: {
            options: ["compact", "standard", "detailed"],
            mode: "dropdown",
          },
        },
      },
      { name: "icon", selector: { icon: {} } },
      boolean("state_accent"),
    ],
  },
  {
    title: "Metrics",
    schema: [
      {
        name: "metrics",
        type: "grid",
        schema: ["cpu", "memory", "disk", "network"].map(boolean),
      },
      boolean("memory_percentage"),
      boolean("disk_percentage"),
      {
        name: "progress_bars",
        type: "expandable",
        title: "Progress bars",
        schema: ["cpu", "memory", "disk"].map(boolean),
      },
    ],
  },
  {
    title: "Actions",
    schema: [
      {
        name: "actions",
        type: "grid",
        schema: Object.keys(actionLabels).map(boolean),
      },
      boolean("show_action_status"),
    ],
  },
  {
    title: "Confirmations",
    schema: [
      {
        name: "confirm",
        selector: {
          select: {
            multiple: true,
            options: Object.entries(actionLabels).map(([value, label]) => ({
              value,
              label,
            })),
            mode: "list",
          },
        },
      },
    ],
  },
  {
    title: "Card interactions",
    schema: ["tap_action", "hold_action", "double_tap_action"].map((name) => ({
      name,
      selector: {
        ui_action: {
          actions: [
            "none",
            "more-info",
            "navigate",
            "url",
            "perform-action",
            "toggle",
            "fire-dom-event",
          ],
        },
      },
    })),
  },
];
export const overrideSchema: FormField[] = [
  {
    name: "entities",
    type: "grid",
    schema: entityRoles.map((name) => ({
      name,
      selector: {
        entity: { filter: { domain: "sensor", integration: "proxmoxve" } },
      },
    })),
  },
];
export const labels: Record<string, string> = {
  tap_action: "Tap",
  hold_action: "Hold",
  double_tap_action: "Double tap",
  device: "Proxmox VM device",
  title: "Title override",
  layout: "Layout",
  icon: "Icon",
  state_accent: "State accent",
  metrics: "Visible metrics",
  cpu: "CPU",
  memory: "Memory",
  disk: "Disk",
  network: "Network",
  memory_percentage: "Memory percentage",
  disk_percentage: "Disk percentage",
  progress_bars: "Progress bars",
  actions: "Visible actions",
  show_action_status: "Show action status",
  confirm: "Require confirmation",
  entities: "Manual sensor overrides",
  memoryTotal: "Memory total",
  memoryPercentage: "Memory percentage sensor",
  diskTotal: "Disk total",
  networkRx: "Network RX",
  networkTx: "Network TX",
  uptime: "Uptime",
  status: "State source",
  ...actionLabels,
};
export function formData(config: VmCardConfig): Record<string, unknown> {
  return {
    ...config,
    tap_action: config.tap_action ?? { action: "more-info" },
    hold_action: config.hold_action ?? { action: "none" },
    double_tap_action: config.double_tap_action ?? { action: "none" },
    layout: config.layout ?? "standard",
    state_accent: config.state_accent ?? true,
    memory_percentage: config.memory_percentage ?? true,
    disk_percentage: config.disk_percentage ?? true,
    show_action_status: config.show_action_status ?? true,
    metrics: {
      cpu: true,
      memory: true,
      disk: true,
      network: true,
      ...config.metrics,
    },
    actions: Object.fromEntries(
      Object.keys(actionLabels).map((id) => [
        id,
        config.actions?.[id as keyof typeof actionLabels] ?? true,
      ]),
    ),
    progress_bars: Object.fromEntries(
      ["cpu", "memory", "disk"].map((key) => [
        key,
        typeof config.progress_bars === "boolean"
          ? config.progress_bars
          : (config.progress_bars?.[key as "cpu"] ?? true),
      ]),
    ),
    confirm: config.confirm ?? defaultConfirmationIds,
  };
}
/** Merge only the section's fields, preserving unknown HA layout fields and untouched YAML. */
export function updateSection(
  config: VmCardConfig,
  schema: FormField[],
  data: Record<string, unknown>,
): VmCardConfig {
  const next = { ...config } as VmCardConfig & Record<string, unknown>;
  for (const { name } of schema) {
    const value = data[name];
    if (name === "entities") {
      const entries = Object.entries((value ?? {}) as object).filter(
        ([, v]) => typeof v === "string" && v.trim(),
      );
      if (entries.length) next.entities = Object.fromEntries(entries);
      else delete next.entities;
    } else if (
      name === "confirm" &&
      Array.isArray(value) &&
      value.length === defaultConfirmationIds.length &&
      defaultConfirmationIds.every((id) => value.includes(id))
    )
      delete next.confirm;
    else if (value === undefined || value === "") delete next[name];
    else if (
      ["metrics", "actions", "progress_bars"].includes(name) &&
      typeof value === "object" &&
      value !== null
    ) {
      const changed = Object.entries(value).filter(
        ([, enabled]) => enabled !== true,
      );
      if (changed.length) next[name] = Object.fromEntries(changed);
      else delete next[name];
    } else if (
      ([
        "state_accent",
        "memory_percentage",
        "disk_percentage",
        "show_action_status",
      ].includes(name) &&
        value === true) ||
      (name === "layout" && value === "standard")
    )
      delete next[name];
    else next[name] = value;
  }
  return next;
}
