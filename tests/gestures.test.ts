// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { CardGestures, executeCardAction } from "../src/card/gestures";
import { validateConfig } from "../src/card/config";
import { formData, sections, updateSection } from "../src/card/editor-schema";
import { ProxmoxVmCard } from "../src/card/proxmox-vm-card";
import "../src/index";
import { fixtures } from "../dev/fixtures";
import type { HomeAssistant } from "../src/ha/types";
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
it("separates single, double and hold and ignores cancelled scrolling gestures", () => {
  vi.useFakeTimers();
  const run = vi.fn();
  const gesture = new CardGestures(run, () => true);
  gesture.click();
  vi.advanceTimersByTime(250);
  expect(run).toHaveBeenLastCalledWith("tap");
  run.mockClear();
  gesture.click();
  gesture.click();
  vi.advanceTimersByTime(250);
  expect(run.mock.calls).toEqual([["double_tap"]]);
  run.mockClear();
  gesture.down({
    button: 0,
    clientX: 0,
    clientY: 0,
    pointerId: 1,
  } as PointerEvent);
  vi.advanceTimersByTime(500);
  gesture.up();
  gesture.click();
  expect(run.mock.calls).toEqual([["hold"]]);
  run.mockClear();
  gesture.down({
    button: 0,
    clientX: 0,
    clientY: 0,
    pointerId: 1,
  } as PointerEvent);
  gesture.move({ clientX: 20, clientY: 0 } as PointerEvent);
  vi.advanceTimersByTime(500);
  gesture.click();
  expect(run).not.toHaveBeenCalled();
  gesture.click();
  gesture.dispose();
  vi.advanceTimersByTime(500);
  expect(run).not.toHaveBeenCalled();
});
it("dispatches composed more-info and custom events, and calls exact configured services", async () => {
  const node = document.createElement("div");
  const info = vi.fn();
  const custom = vi.fn();
  node.addEventListener("hass-more-info", info);
  node.addEventListener("ll-custom", custom);
  const hass = {
    callService: vi.fn().mockResolvedValue(undefined),
  } as unknown as HomeAssistant;
  await executeCardAction(
    node,
    hass,
    { action: "more-info" },
    "sensor.vm_status",
  );
  expect(info.mock.calls[0]![0].detail).toEqual({
    entityId: "sensor.vm_status",
  });
  expect(info.mock.calls[0]![0].composed).toBe(true);
  await executeCardAction(node, hass, { action: "fire-dom-event", test: 1 });
  expect(custom).toHaveBeenCalledOnce();
  await executeCardAction(node, hass, {
    action: "perform-action",
    perform_action: "light.turn_on",
    target: { entity_id: "light.test" },
    data: { brightness: 100 },
  });
  expect(hass.callService).toHaveBeenCalledWith(
    "light",
    "turn_on",
    { brightness: 100 },
    { entity_id: "light.test" },
  );
  window.confirm = vi.fn().mockReturnValue(false);
  await executeCardAction(node, hass, {
    action: "toggle",
    entity: "light.test",
    confirmation: { text: "Sure?" },
  });
  expect(hass.callService).toHaveBeenCalledTimes(1);
});
it("validates gesture settings and persists each editor field", () => {
  const config = { type: "custom:proxmox-vm-card" as const, device: "device" };
  validateConfig(config);
  expect(formData(config).tap_action).toEqual({ action: "more-info" });
  for (const name of ["tap_action", "hold_action", "double_tap_action"]) {
    const next = updateSection(
      config,
      sections.find((s) => s.title === "Card interactions")!.schema,
      { [name]: { action: "navigate", navigation_path: "/test" } },
    );
    expect(next).toHaveProperty(name, {
      action: "navigate",
      navigation_path: "/test",
    });
    validateConfig(next);
    expect(() =>
      validateConfig({ ...config, [name]: { action: "invalid" } }),
    ).toThrow();
  }
  expect(() =>
    validateConfig({
      ...config,
      tap_action: { action: "url", url_path: "javascript:alert(1)" },
    }),
  ).toThrow();
});
it("card surface clicks run actions but lifecycle buttons and overflow never bubble into them", async () => {
  const card = document.createElement("proxmox-vm-card") as ProxmoxVmCard;
  card.setConfig({
    type: "custom:proxmox-vm-card",
    device: "device",
    tap_action: { action: "fire-dom-event" },
  });
  card.hass = {
    callWS: () => new Promise(() => {}),
    connection: { subscribeEvents: () => new Promise(() => {}) },
    states: {},
  } as HomeAssistant;
  const editorDialog = document.createElement("dialog");
  document.body.append(editorDialog);
  editorDialog.append(card);
  card.loading = false;
  card.model = fixtures["Running healthy"];
  await card.updateComplete;
  const fired = vi.fn();
  card.addEventListener("ll-custom", fired);
  card
    .shadowRoot!.querySelector("header")!
    .dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  expect(fired).toHaveBeenCalledOnce();
  card
    .shadowRoot!.querySelector("button")!
    .dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  card
    .shadowRoot!.querySelector("summary")!
    .dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  expect(fired).toHaveBeenCalledOnce();
});
it("uses HA's registered action-handler without duplicate fallback gestures and isolates controls", async () => {
  const registered = customElements.get.bind(customElements);
  vi.spyOn(customElements, "get").mockImplementation((name) =>
    name === "action-handler" ? HTMLElement : registered(name),
  );
  const bound = new WeakSet<HTMLElement>();
  const bind = vi.fn((element: HTMLElement) => {
    if (bound.has(element)) return;
    bound.add(element);
    element.addEventListener("click", (event) =>
      event.target!.dispatchEvent(
        new CustomEvent("action", {
          detail: { action: "tap" },
          bubbles: true,
          composed: true,
        }),
      ),
    );
  });
  const handler = Object.assign(document.createElement("action-handler"), {
    bind,
  });
  document.body.append(handler);
  const card = document.createElement("proxmox-vm-card") as ProxmoxVmCard;
  card.setConfig({
    type: "custom:proxmox-vm-card",
    device: "device",
    tap_action: { action: "fire-dom-event" },
    hold_action: { action: "more-info" },
  });
  card.hass = {
    callWS: () => new Promise(() => {}),
    connection: { subscribeEvents: () => new Promise(() => {}) },
    states: {},
  } as HomeAssistant;
  const editor = document.createElement("dialog");
  document.body.append(editor);
  editor.append(card);
  card.loading = false;
  card.model = fixtures["Running healthy"];
  await card.updateComplete;
  expect(bind).toHaveBeenCalledWith(card.shadowRoot!.querySelector("ha-card"), {
    hasHold: true,
    hasDoubleClick: false,
  });
  const fired = vi.fn();
  card.addEventListener("ll-custom", fired);
  const click = (selector: string) =>
    card
      .shadowRoot!.querySelector(selector)!
      .dispatchEvent(
        new MouseEvent("click", { bubbles: true, composed: true }),
      );
  click("header");
  expect(fired).toHaveBeenCalledOnce();
  click("button");
  click("summary");
  expect(fired).toHaveBeenCalledOnce();
  card.setConfig({
    type: "custom:proxmox-vm-card",
    device: "device",
    double_tap_action: { action: "more-info" },
  });
  await card.updateComplete;
  expect(bind).toHaveBeenLastCalledWith(
    card.shadowRoot!.querySelector("ha-card"),
    { hasHold: false, hasDoubleClick: true },
  );
});
