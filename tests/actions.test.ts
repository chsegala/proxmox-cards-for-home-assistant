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

it("allows configurable Start confirmation and disabling Reboot confirmation", async () => {
  const { hass, send } = setup();
  hass.states["sensor.vm_status"]!.state = "stopped";
  const card = document.createElement("proxmox-vm-card") as ProxmoxVmCard;
  card.setConfig({
    type: "custom:proxmox-vm-card",
    device: "vm",
    confirm: ["start"],
  });
  card.hass = hass;
  document.body.append(card);
  await flush();
  await card.updateComplete;
  card.shadowRoot!.querySelector<HTMLButtonElement>("footer button")!.click();
  await flush();
  await card.updateComplete;
  expect(card.shadowRoot!.querySelector("dialog")).not.toBeNull();
  expect(send).not.toHaveBeenCalled();
  card.shadowRoot!.querySelector<HTMLButtonElement>("dialog button")!.click();
  hass.states["sensor.vm_status"]!.state = "running";
  card.hass = hass;
  card.setConfig({ type: "custom:proxmox-vm-card", device: "vm", confirm: [] });
  await card.updateComplete;
  [...card.shadowRoot!.querySelectorAll<HTMLButtonElement>("footer button")]
    .find((button) => button.textContent?.trim() === "Reboot")!
    .click();
  await flush();
  await card.updateComplete;
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ target: { entity_id: "button.restart" } }),
  );
  expect(card.shadowRoot!.querySelector("dialog")).toBeNull();
});
it("retains errors through presentation changes and applies action visibility", async () => {
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
  send.mockRejectedValue(new Error("Permission denied"));
  card.shadowRoot!.querySelector<HTMLButtonElement>("footer button")!.click();
  await flush();
  await card.updateComplete;
  card.setConfig({
    type: "custom:proxmox-vm-card",
    device: "vm",
    show_action_status: false,
    layout: "compact",
    actions: { start: false },
  });
  card.hass = hass;
  await card.updateComplete;
  expect(
    card.shadowRoot!.querySelector('[role="alert"]')?.textContent,
  ).toContain("Permission denied");
  expect(card.shadowRoot!.querySelector("footer button")).toBeNull();
});

it.each(["success", "failure"])(
  "finishes action feedback after registry refresh (%s)",
  async (outcome) => {
    const { hass, send } = setup();
    let finish!: () => void;
    let reject!: (error: Error) => void;
    send.mockImplementation(
      () =>
        new Promise<void>((resolve, fail) => {
          finish = resolve;
          reject = fail;
        }),
    );
    let refresh!: () => void;
    hass.connection.subscribeEvents = async (callback) => {
      refresh = callback;
      return () => {};
    };
    const results: ActionResult[] = [];
    const controller = new VmController(
      () => {},
      (result) => results.push(result),
    );
    controller.configure("vm");
    controller.update(hass);
    controller.connect();
    await flush();
    const pending = controller.press("shutdown", "vm");
    refresh();
    await flush();
    await controller.press("shutdown", "vm");
    expect(send).toHaveBeenCalledOnce();
    if (outcome === "success") finish();
    else reject(new Error("Denied"));
    await pending;
    expect(results.at(-1)?.pending).toBe(false);
    if (outcome === "success")
      expect(results.at(-1)?.message).toContain("accepted");
    else expect(results.at(-1)?.error).toBe("Denied");
    controller.disconnect();
  },
);
it.each([false, true])(
  "waits for the requested target through unavailable/unknown and registry reload (before response: %s)",
  async (beforeResponse) => {
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
      (result) => results.push(result),
    );
    controller.configure("vm");
    controller.update(hass);
    controller.connect();
    await flush();
    const pending = controller.press("shutdown", "vm");
    if (beforeResponse) {
      hass.states["sensor.vm_status"]!.state = "unavailable";
      controller.update(hass);
    }
    finish();
    await pending;
    expect(results.at(-1)?.message).toContain("accepted");
    for (const state of ["unavailable", "unknown", "suspended", "running"]) {
      hass.states["sensor.vm_status"]!.state = state;
      controller.update(hass);
      expect(results.at(-1)?.message).toContain("accepted");
    }
    controller.retry();
    await flush();
    expect(results.at(-1)?.message).toContain("accepted");
    hass.states["sensor.vm_status"]!.state = "stopped";
    controller.retry();
    await flush();
    expect(results.at(-1)).toEqual({ pending: false });
    controller.disconnect();
  },
);
it("an old action response cannot unlock a new action after reconfiguration", async () => {
  const { hass, send } = setup();
  const finishes: (() => void)[] = [];
  send.mockImplementation(
    () => new Promise<void>((resolve) => finishes.push(resolve)),
  );
  const results: ActionResult[] = [];
  const controller = new VmController(
    () => {},
    (result) => results.push(result),
  );
  controller.configure("vm");
  controller.update(hass);
  controller.connect();
  await flush();
  const first = controller.press("shutdown", "vm");
  controller.configure("vm");
  await flush();
  const second = controller.press("reboot", "vm");
  finishes[0]!();
  await first;
  expect(results.at(-1)?.message).toBe("Sending Reboot…");
  expect(controller.canPress("reboot")).toBe(false);
  finishes[1]!();
  await second;
  expect(results.at(-1)?.message).toContain("Reboot request accepted");
  controller.disconnect();
});
it.each([
  ["start", "stopped", "running"],
  ["shutdown", "running", "stopped"],
  ["force-stop", "running", "stopped"],
  ["suspend", "running", "suspended"],
  ["resume", "suspended", "running"],
] as const)(
  "clears %s feedback only when %s becomes %s",
  async (action, initial, target) => {
    const { hass } = setup();
    hass.states["sensor.vm_status"]!.state = initial;
    const results: ActionResult[] = [];
    const controller = new VmController(
      () => {},
      (result) => results.push(result),
    );
    controller.configure("vm");
    controller.update(hass);
    controller.connect();
    await flush();
    await controller.press(action, "vm");
    for (const state of ["unknown", "unavailable", initial]) {
      hass.states["sensor.vm_status"]!.state = state;
      controller.update(hass);
      expect(results.at(-1)?.message).toContain("accepted");
    }
    hass.states["sensor.vm_status"]!.state = target;
    controller.update(hass);
    expect(results.at(-1)).toEqual({ pending: false });
    controller.disconnect();
  },
);
