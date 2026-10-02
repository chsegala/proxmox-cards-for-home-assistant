// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import "../src/index";
import { ProxmoxVmCard } from "../src/card/proxmox-vm-card";
import type { ProxmoxVmCardEditor } from "../src/card/proxmox-vm-card-editor";
import {
  validateConfig,
  requiresConfirmation,
  type VmCardConfig,
} from "../src/card/config";
import {
  formData,
  sections,
  updateSection,
  overrideSchema,
} from "../src/card/editor-schema";
import { discoverVm } from "../src/proxmox/official-adapter";
import {
  entityStatus,
  requiredDisabled,
  enableRequired,
} from "../src/ha/editor-discovery";
import type { Registry, HomeAssistant, EntityEntry } from "../src/ha/types";
const config: VmCardConfig = { type: "custom:proxmox-vm-card", device: "vm" };
const entity = (
  key: string,
  disabled_by: string | null = null,
): EntityEntry => ({
  entity_id: `sensor.${key}`,
  device_id: "vm",
  platform: "proxmoxve",
  unique_id: `entry_104_${key}`,
  disabled_by,
});
const registry: Registry = {
  devices: [
    {
      id: "vm",
      name: "VM",
      name_by_user: null,
      model: "VM",
      identifiers: [["proxmoxve", "entry_vm_104"]],
      via_device_id: "node",
    },
    {
      id: "node",
      name: "pve",
      name_by_user: null,
      model: "Node",
      identifiers: [["proxmoxve", "entry_node_node/pve"]],
      via_device_id: null,
    },
  ],
  entities: [
    entity("vm_status"),
    entity("vm_cpu"),
    entity("vm_disk", "user"),
    entity("vm_max_disk", "integration"),
    entity("vm_netin", "user"),
    entity("vm_netout", "integration"),
    entity("unrelated", "user"),
  ],
};
function setup() {
  const mutation = vi.fn().mockResolvedValue({ reload_delay: 30 });
  const hass: HomeAssistant = {
    user: { is_admin: true },
    states: {
      "sensor.vm_status": { state: "running", attributes: {} },
      "sensor.vm_cpu": {
        state: "20",
        attributes: { unit_of_measurement: "%" },
      },
    },
    connection: { subscribeEvents: async () => () => {} },
    callWS: async <T>(message: Parameters<HomeAssistant["callWS"]>[0]) => {
      if (message.type === "config/device_registry/list")
        return registry.devices as T;
      if (message.type === "config/entity_registry/list")
        return registry.entities as T;
      return (await mutation(message)) as T;
    },
  };
  return { hass, mutation };
}
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
afterEach(() => document.body.replaceChildren());
it("preserves old YAML defaults, requires a device outside setup, and validates new fields", () => {
  expect(() => validateConfig(config)).not.toThrow();
  expect(() => validateConfig({ ...config, device: "" })).toThrow("device ID");
  expect(() => validateConfig({ ...config, device: "" }, true)).not.toThrow();
  expect(formData(config)).toMatchObject({
    metrics: { cpu: true, network: true },
    layout: "standard",
    show_action_status: true,
  });
  expect(requiresConfirmation(config, "reboot")).toBe(true);
  expect(requiresConfirmation(config, "start")).toBe(false);
  expect(requiresConfirmation({ ...config, confirm: [] }, "reboot")).toBe(
    false,
  );
  expect(requiresConfirmation({ ...config, confirm: ["start"] }, "start")).toBe(
    true,
  );
  for (const bad of [
    { metrics: { cpu: "no" } },
    { metrics: { cpu_percentage: false } },
    { actions: { erase: true } },
    { confirm: ["bogus"] },
    { confirm: "reboot" },
    { progress_bars: [] },
    { title: 4 },
    { cpu_percentage: false },
  ])
    expect(() =>
      validateConfig({ ...config, ...bad } as VmCardConfig),
    ).toThrow();
});
it("registers the picker and provides a graceful empty stub", async () => {
  expect(
    (
      window as unknown as Window & { customCards: { type: string }[] }
    ).customCards.some((c) => c.type === "proxmox-vm-card"),
  ).toBe(true);
  const card = document.createElement("proxmox-vm-card") as ProxmoxVmCard;
  card.setConfig({ ...config, ...ProxmoxVmCard.getStubConfig() });
  document.body.append(card);
  await card.updateComplete;
  expect(card.shadowRoot!.textContent).toContain("Select a VM device");
});
it.each([
  [0, "device", "other"],
  [0, "layout", "detailed"],
  [0, "title", "My VM"],
  [1, "metrics", { cpu: false, network: true }],
  [2, "actions", { reboot: false }],
  [3, "confirm", ["start"]],
] as const)(
  "emits normal config-changed for section %s field %s",
  async (section, key, value) => {
    const editor = document.createElement(
      "proxmox-vm-card-editor",
    ) as ProxmoxVmCardEditor;
    editor.setConfig(config);
    document.body.append(editor);
    await editor.updateComplete;
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);
    editor
      .shadowRoot!.querySelectorAll("ha-form")
      .item(section)!
      .dispatchEvent(
        new CustomEvent("value-changed", {
          detail: { value: { ...formData(config), [key]: value } },
        }),
      );
    expect(changed).toHaveBeenCalledTimes(1);
    expect(
      (changed.mock.calls[0]![0] as CustomEvent).detail.config[key],
    ).toEqual(
      typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).filter(([, v]) => v !== true),
          )
        : value,
    );
  },
);
it("persists and clears overrides without changing unrelated configuration", () => {
  const overridden = updateSection(config, overrideSchema, {
    entities: { cpu: "sensor.vm_cpu" },
  });
  expect(overridden.entities).toEqual({ cpu: "sensor.vm_cpu" });
  expect(
    updateSection(overridden, overrideSchema, { entities: { cpu: "" } })
      .entities,
  ).toBeUndefined();
  expect(
    updateSection(
      { ...config, progress_bars: false },
      sections[0]!.schema,
      formData(config),
    ).progress_bars,
  ).toBe(false);
});
it("distinguishes all diagnostic statuses", () => {
  const { hass } = setup();
  expect(entityStatus(entity("vm_cpu"), hass)).toBe("available");
  expect(entityStatus(entity("vm_cpu"), hass, true)).toBe("overridden");
  expect(entityStatus(entity("vm_disk", "user"), hass)).toBe("disabled");
  expect(entityStatus(undefined, hass)).toBe("missing");
  expect(entityStatus(entity("vm_uptime"), hass)).toBe("unavailable");
});
it("enables only dependencies of desired features and reports partial failures", async () => {
  const { hass, mutation } = setup();
  const binding = discoverVm(registry, "vm");
  expect(
    requiredDisabled(binding, { ...config, metrics: { disk: false } }, "disk"),
  ).toEqual([]);
  expect(
    requiredDisabled(binding, config, "disk").map((e) => e.entity_id),
  ).toEqual(["sensor.vm_disk", "sensor.vm_max_disk"]);
  mutation.mockRejectedValueOnce({
    code: "unauthorized",
    message: "Forbidden",
  });
  const result = await enableRequired(hass, binding, config, "network");
  expect(result.enabled).toEqual(["sensor.vm_netout"]);
  expect(result.failed[0]?.error).toContain("permission");
  expect(mutation.mock.calls.map(([m]) => m)).toEqual([
    {
      type: "config/entity_registry/update",
      entity_id: "sensor.vm_netin",
      disabled_by: null,
    },
    {
      type: "config/entity_registry/update",
      entity_id: "sensor.vm_netout",
      disabled_by: null,
    },
  ]);
});
it("blocks non-admin mutation and shows administrator instructions", async () => {
  const { hass, mutation } = setup();
  hass.user = { is_admin: false };
  await expect(
    enableRequired(hass, discoverVm(registry, "vm"), config, "disk"),
  ).rejects.toThrow("permission");
  expect(mutation).not.toHaveBeenCalled();
  const editor = document.createElement(
    "proxmox-vm-card-editor",
  ) as ProxmoxVmCardEditor;
  editor.setConfig(config);
  editor.hass = hass;
  document.body.append(editor);
  await flush();
  await editor.updateComplete;
  expect(editor.shadowRoot!.textContent).toContain(
    "ask a Home Assistant administrator",
  );
  expect(
    [...editor.shadowRoot!.querySelectorAll("button")].some((b) =>
      b.textContent?.includes("Enable"),
    ),
  ).toBe(false);
});
it("refreshes discovery after an explicit enable operation", async () => {
  const { hass, mutation } = setup();
  const reads = vi.spyOn(hass, "callWS");
  const editor = document.createElement(
    "proxmox-vm-card-editor",
  ) as ProxmoxVmCardEditor;
  editor.setConfig(config);
  editor.hass = hass;
  document.body.append(editor);
  await flush();
  await editor.updateComplete;
  const before = reads.mock.calls.length;
  [...editor.shadowRoot!.querySelectorAll("button")]
    .find((b) => b.textContent?.includes("Enable disk"))!
    .click();
  await flush();
  await editor.updateComplete;
  expect(mutation).toHaveBeenCalledTimes(2);
  expect(reads.mock.calls.length).toBeGreaterThan(before + 2);
  expect(editor.shadowRoot!.textContent).toContain("2 entities enabled");
});

it("uses the minimal memory dependency path, preserving explicit raw overrides", () => {
  const binding = discoverVm(registry, "vm");
  binding.sensors.memory = entity("vm_memory", "integration");
  binding.sensors.memoryTotal = entity("vm_max_memory");
  binding.sensors.memoryPercentage = entity("vm_memory_percentage");
  expect(requiredDisabled(binding, config, "memory")).toEqual([]);
  binding.sensors.memoryTotal.disabled_by = "integration";
  expect(
    requiredDisabled(binding, config, "memory").map((e) => e.entity_id),
  ).toEqual(["sensor.vm_max_memory"]);
  binding.overrides.memory = "sensor.vm_memory";
  expect(
    requiredDisabled(binding, config, "memory").map((e) => e.entity_id),
  ).toEqual(["sensor.vm_memory", "sensor.vm_max_memory"]);
});
