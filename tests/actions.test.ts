// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { VmController, type ActionResult } from "../src/ha/vm-controller";
import type { HomeAssistant, Registry } from "../src/ha/types";
import "../src/index";
import type { ProxmoxVmCard } from "../src/card/proxmox-vm-card";
const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};
const registry: Registry = {
  devices: [
    {
      id: "vm",
      name: "Test VM",
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
    "vm_status",
    "vm_uptime",
    "start",
    "shutdown",
    "restart",
    "pause",
    "stop",
    "resume",
  ].map((key) => ({
    entity_id: `${key.startsWith("vm_") ? "sensor" : "button"}.${key}`,
    device_id: "vm",
    platform: "proxmoxve",
    unique_id: `entry_104_${key}`,
    disabled_by: null,
  })),
};
function setup() {
  const send = vi.fn().mockResolvedValue(null);
  const hass: HomeAssistant = {
    states: Object.fromEntries(
      registry.entities.map((e) => [
        e.entity_id,
        {
          state: e.entity_id.startsWith("sensor.") ? "running" : "unknown",
          attributes: {},
        },
      ]),
    ),
    connection: { subscribeEvents: async () => () => {} },
    callWS: async <T>(message: Parameters<HomeAssistant["callWS"]>[0]) => {
      if (message.type === "config/device_registry/list")
        return registry.devices as T;
      if (message.type === "config/entity_registry/list")
        return registry.entities as T;
      return (await send(message)) as T;
    },
  };
  return { hass, send };
}
afterEach(() => {
  document.body.replaceChildren();
});
it("targets only the discovered official button and prevents duplicate calls", async () => {
  const { hass, send } = setup();
  let finish!: () => void;
  send.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const results: ActionResult[] = [];
  const controller = new VmController(
    () => {},
    (r) => results.push(r),
  );
  controller.configure("vm");
  controller.update(hass);
  controller.connect();
  await flush();
  const first = controller.press("reboot", "vm");
  await controller.press("reboot", "vm");
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith({
    type: "call_service",
    domain: "button",
    service: "press",
    target: { entity_id: "button.restart" },
  });
  expect(results.at(-1)?.pending).toBe(true);
  finish();
  await first;
  expect(results.at(-1)?.message).toContain("request accepted");
  controller.disconnect();
});
it("rejects stale device, state and unavailable entity before execution", async () => {
  const { hass, send } = setup();
  const controller = new VmController(() => {});
  controller.configure("vm");
  controller.update(hass);
  controller.connect();
  await flush();
  await controller.press("shutdown", "other-device");
  hass.states["sensor.vm_status"]!.state = "stopped";
  await controller.press("shutdown", "vm");
  hass.states["button.start"]!.state = "unavailable";
  await controller.press("start", "vm");
  expect(send).not.toHaveBeenCalled();
  controller.disconnect();
});
it("reports permission errors without claiming success or changing VM state", async () => {
  const { hass, send } = setup();
  send.mockRejectedValue({ message: "Unauthorized" });
  const results: ActionResult[] = [];
  const controller = new VmController(
    () => {},
    (r) => results.push(r),
  );
  controller.configure("vm");
  controller.update(hass);
  controller.connect();
  await flush();
  await controller.press("shutdown", "vm");
  expect(results.at(-1)?.error).toBe("Unauthorized");
  expect(hass.states["sensor.vm_status"]!.state).toBe("running");
  controller.disconnect();
});
it("requires confirmation, cancels without calls, and dispatches only after confirmation", async () => {
  const { hass, send } = setup();
  const card = document.createElement("proxmox-vm-card") as ProxmoxVmCard;
  card.setConfig({ type: "custom:proxmox-vm-card", device: "vm" });
  card.hass = hass;
  document.body.append(card);
  await flush();
  await card.updateComplete;
  const shutdown = Array.from(card.shadowRoot!.querySelectorAll("button")).find(
    (b) => b.textContent === "Shutdown",
  )!;
  shutdown.click();
  await flush();
  await card.updateComplete;
  expect(card.shadowRoot!.querySelector("dialog")?.textContent).toContain(
    "Shutdown Test VM?",
  );
  expect(send).not.toHaveBeenCalled();
  card.shadowRoot!.querySelector<HTMLButtonElement>("dialog button")!.click();
  await card.updateComplete;
  expect(card.shadowRoot!.querySelector("dialog")).toBeNull();
  expect(send).not.toHaveBeenCalled();
  shutdown.click();
  await flush();
  await card.updateComplete;
  card
    .shadowRoot!.querySelectorAll<HTMLButtonElement>("dialog button")[1]!
    .click();
  await flush();
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ target: { entity_id: "button.shutdown" } }),
  );
});
it("allows Start without confirmation", async () => {
  const { hass, send } = setup();
  hass.states["sensor.vm_status"]!.state = "stopped";
  const card = document.createElement("proxmox-vm-card") as ProxmoxVmCard;
  card.setConfig({ type: "custom:proxmox-vm-card", device: "vm" });
  card.hass = hass;
  document.body.append(card);
  await flush();
  await card.updateComplete;
  card.shadowRoot!.querySelector<HTMLButtonElement>("footer button")!.click();
  await flush();
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ target: { entity_id: "button.start" } }),
  );
  expect(card.shadowRoot!.querySelector("dialog")).toBeNull();
});

it("clears accepted feedback after a status change, retaining it for metric-only updates", async () => {
  const { hass } = setup();
  hass.states["sensor.vm_status"]!.state = "stopped";
  const results: ActionResult[] = [];
  const controller = new VmController(
    () => {},
    (r) => results.push(r),
  );
  controller.configure("vm");
  controller.update(hass);
  controller.connect();
  await flush();
  await controller.press("start", "vm");
  expect(results.at(-1)?.message).toContain("request accepted");
  controller.update(hass);
  expect(results.at(-1)?.message).toContain("request accepted");
  hass.states["sensor.vm_status"]!.state = "running";
  controller.update(hass);
  expect(results.at(-1)).toEqual({ pending: false });
  controller.disconnect();
});

it("clears reboot feedback when uptime resets without a status transition", async () => {
  const { hass } = setup();
  hass.states["sensor.vm_uptime"] = {
    state: "600",
    attributes: { unit_of_measurement: "s" },
  };
  const results: ActionResult[] = [];
  const controller = new VmController(
    () => {},
    (r) => results.push(r),
  );
  controller.configure("vm");
  controller.update(hass);
  controller.connect();
  await flush();
  await controller.press("reboot", "vm");
  expect(results.at(-1)?.message).toContain("request accepted");
  hass.states["sensor.vm_uptime"]!.state = "660";
  controller.update(hass);
  expect(results.at(-1)?.message).toContain("request accepted");
  hass.states["sensor.vm_uptime"]!.state = "20";
  controller.update(hass);
  expect(results.at(-1)).toEqual({ pending: false });
  controller.disconnect();
});

it("hides normal footer feedback while always showing action errors", async () => {
  const { hass, send } = setup();
  hass.states["sensor.vm_status"]!.state = "stopped";
  const card = document.createElement("proxmox-vm-card") as ProxmoxVmCard;
  card.setConfig({
    type: "custom:proxmox-vm-card",
    device: "vm",
    show_action_status: false,
  });
  card.hass = hass;
  document.body.append(card);
  await flush();
  await card.updateComplete;
  expect(card.shadowRoot!.querySelector(".preview")).toBeNull();
  send.mockRejectedValue(new Error("Permission denied"));
  card.shadowRoot!.querySelector<HTMLButtonElement>("footer button")!.click();
  await flush();
  await card.updateComplete;
  expect(
    card.shadowRoot!.querySelector('[role="alert"]')?.textContent,
  ).toContain("Last occurred error:");
  expect(
    card.shadowRoot!.querySelector('[role="alert"]')?.textContent,
  ).toContain("Permission denied");
});
