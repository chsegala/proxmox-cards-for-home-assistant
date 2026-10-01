// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import "../src/index";
import { ProxmoxVmCard } from "../src/card/proxmox-vm-card";
import { fixtures } from "../dev/fixtures";
afterEach(() => {
  document.body.replaceChildren();
});
async function card(fixture = "Running healthy") {
  const element = document.createElement("proxmox-vm-card") as ProxmoxVmCard;
  element.setConfig({ type: "custom:proxmox-vm-card", device: "device" });
  element.model = fixtures[fixture];
  document.body.append(element);
  await element.updateComplete;
  return element;
}
describe("card presentation", () => {
  it.each(["Stopped", "Suspended"])(
    "collapses telemetry for %s VMs and restores it when running",
    async (fixture) => {
      const element = await card(fixture);
      expect(element.shadowRoot!.querySelector(".metrics")).toBeNull();
      expect(element.shadowRoot!.querySelector(".network")).toBeNull();
      expect(element.shadowRoot!.querySelector("header")).not.toBeNull();
      expect(
        element.shadowRoot!.querySelector("footer")?.textContent,
      ).toContain(fixture === "Stopped" ? "Start" : "Resume");
      element.model = fixtures["Running healthy"];
      await element.updateComplete;
      expect(element.shadowRoot!.querySelector(".metrics")).not.toBeNull();
      expect(element.shadowRoot!.querySelector(".network")).not.toBeNull();
    },
  );
  it("distinguishes missing uptime from temporarily unavailable uptime", async () => {
    const element = await card();
    const model = element.model!;
    element.model = {
      ...model,
      capabilities: { ...model.capabilities, uptime: "missing" },
    };
    await element.updateComplete;
    expect(
      element.shadowRoot!.querySelector(".status")?.textContent?.trim(),
    ).toContain("Running");
    expect(
      element.shadowRoot!.querySelector(".status")?.textContent,
    ).not.toContain("unavailable");
    element.model = {
      ...model,
      capabilities: { ...model.capabilities, uptime: "unavailable" },
    };
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector(".status")?.textContent).toContain(
      "Uptime unavailable",
    );
  });
  it("shows uptime, CPU percent, cumulative network and separated Force Stop", async () => {
    const element = await card();
    const root = element.shadowRoot!;
    expect(root.textContent).toContain("4d 7h");
    expect(root.textContent).toContain("42%");
    expect(
      root.querySelector('[aria-label="Memory"] .metric-heading .percentage')
        ?.textContent,
    ).toBe("39%");
    expect(root.textContent).toContain("cumulative totals");
    expect(root.querySelector("details button")?.textContent).toBe(
      "Force Stop",
    );
    expect(root.querySelectorAll("button:disabled")).toHaveLength(4);
    expect(root.querySelector(".status")?.getAttribute("aria-label")).toContain(
      "Running",
    );
  });
  it("retains unavailable memory and renders healthy CPU", async () => {
    const element = await card("One unavailable metric");
    expect(
      element.shadowRoot!.querySelector('[aria-label="Memory"]')?.textContent,
    ).toContain("Unavailable");
    expect(element.shadowRoot!.textContent).toContain("42%");
    expect(
      element
        .shadowRoot!.querySelector('[aria-label="Memory"] .unavailable-bar')
        ?.getAttribute("aria-label"),
    ).toBe("Memory utilization unavailable");
    element.setConfig({
      type: "custom:proxmox-vm-card",
      device: "device",
      progress_bars: false,
    });
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector(".unavailable-bar")).toBeNull();
  });
  it("omits missing optional capabilities", async () => {
    const element = await card("Missing optional metrics");
    expect(element.shadowRoot!.querySelector('[aria-label="Disk"]')).toBeNull();
    expect(element.shadowRoot!.querySelector(".network")).toBeNull();
  });
  it("masks unavailable values and removes controls", async () => {
    const element = await card("Unavailable VM");
    expect(element.shadowRoot!.textContent).not.toContain("42%");
    expect(element.shadowRoot!.querySelector("footer")).toBeNull();
  });
  it("supports independent bars while keeping CPU percent visible", async () => {
    const element = await card();
    element.setConfig({
      type: "custom:proxmox-vm-card",
      device: "device",
      progress_bars: { cpu: false, memory: true, disk: false },
      memory_percentage: false,
      disk_percentage: false,
    });
    await element.updateComplete;
    expect(element.shadowRoot!.querySelectorAll("progress")).toHaveLength(1);
    expect(element.shadowRoot!.textContent).toContain("42%");
    expect(element.shadowRoot!.querySelector(".percentage")).toBeNull();
  });
  it.each(["compact", "standard", "detailed"] as const)(
    "renders %s density",
    async (layout) => {
      const element = await card();
      element.setConfig({
        type: "custom:proxmox-vm-card",
        device: "device",
        layout,
      });
      await element.updateComplete;
      expect(
        element.shadowRoot!.querySelector(`ha-card.${layout}`),
      ).not.toBeNull();
      expect(element.shadowRoot!.querySelector("dl") !== null).toBe(
        layout === "detailed",
      );
    },
  );
  it("renders loading and waiting states", async () => {
    const element = await card();
    element.loading = true;
    await element.updateComplete;
    expect(element.shadowRoot!.textContent).toContain("Loading VM");
    element.loading = false;
    element.model = undefined;
    await element.updateComplete;
    expect(element.shadowRoot!.textContent).toContain("Waiting for VM data");
  });
});
