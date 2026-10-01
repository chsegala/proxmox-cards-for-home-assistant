// @vitest-environment happy-dom
import { expect, it } from "vitest";
import "../dev/ha-preview";
import type { ProxmoxVmCard } from "../src/card/proxmox-vm-card";

it("injects fixtures through a separate development-only element", async () => {
  const card = document.createElement("proxmox-vm-test-card") as ProxmoxVmCard;
  card.setConfig({
    type: "custom:proxmox-vm-card",
    device: "unused",
    ...{ fixture: "One unavailable metric" },
  });
  document.body.append(card);
  await card.updateComplete;
  expect(card.model?.metrics.memory?.availability).toBe("unavailable");
  expect(card.shadowRoot?.textContent).toContain("42%");
  card.setConfig({
    type: "custom:proxmox-vm-card",
    device: "unused",
    ...{ fixture: "Loading" },
  });
  await card.updateComplete;
  expect(card.shadowRoot?.textContent).toContain("Loading VM");
  card.remove();
});
it("rejects unknown fixture names", () => {
  const card = document.createElement("proxmox-vm-test-card") as ProxmoxVmCard;
  expect(() =>
    card.setConfig({
      type: "custom:proxmox-vm-card",
      device: "unused",
      ...{ fixture: "not-a-fixture" },
    }),
  ).toThrow("Unknown test fixture");
});
