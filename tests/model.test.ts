import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatPercentage,
  formatUptime,
} from "../src/infrastructure/format";
import {
  defaultConfirmations,
  visibleActions,
} from "../src/infrastructure/model";
import { metricFor } from "../src/proxmox/model";
import { fixtures } from "../dev/fixtures";
import { validateConfig } from "../src/card/config";
const running = fixtures["Running healthy"]!;
describe("formatters", () => {
  it("formats uptime boundaries without rounding into the next day", () => {
    expect(formatUptime(0)).toBe("<1m");
    expect(formatUptime(59)).toBe("<1m");
    expect(formatUptime(60)).toBe("1m");
    expect(formatUptime(3600)).toBe("1h 0m");
    expect(formatUptime(86399)).toBe("23h 59m");
    expect(formatUptime(370800)).toBe("4d 7h");
    expect(formatUptime(-1)).toBe("Unavailable");
  });
  it("uses decimal byte units including zero and large totals", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1000)).toBe("1 kB");
    expect(formatBytes(780e6)).toBe("780 MB");
    expect(formatBytes(6.2e9)).toBe("6.2 GB");
    expect(formatBytes(1e15)).toBe("1 PB");
    expect(formatBytes(NaN)).toBe("Unavailable");
  });
  it("rounds and clamps percentages", () => {
    expect(formatPercentage(38.75)).toBe("39%");
    expect(formatPercentage(150)).toBe("100%");
    expect(formatPercentage(-1)).toBe("0%");
    expect(formatPercentage(Infinity)).toBe("Unavailable");
  });
});
describe("normalized capabilities", () => {
  it.each([
    ["running", ["shutdown", "reboot", "suspend", "force-stop"]],
    ["stopped", ["start"]],
    ["suspended", ["resume", "force-stop"]],
    ["unknown", []],
    ["unavailable", []],
  ] as const)("selects actions for %s", (state, expected) => {
    expect(
      visibleActions(state, running.actions).map((action) => action.id),
    ).toEqual(expected);
  });
  it("omits disabled and missing actions", () => {
    expect(
      visibleActions("running", [
        { id: "shutdown", capability: "disabled" },
        { id: "reboot", capability: "missing" },
      ]),
    ).toEqual([]);
  });
  it("preserves default confirmations", () => {
    expect(defaultConfirmations).toEqual({
      start: false,
      resume: false,
      shutdown: true,
      reboot: true,
      suspend: true,
      "force-stop": true,
    });
  });
  it("omits missing and disabled metrics even if stale values exist", () => {
    const model = fixtures["Missing optional metrics"]!;
    expect(metricFor(model, "disk")).toBeUndefined();
    expect(metricFor(model, "networkRx")).toBeUndefined();
    expect(metricFor(model, "cpu")?.value).toBe(42);
  });
  it("keeps one unavailable metric without losing the others", () => {
    const model = fixtures["One unavailable metric"]!;
    expect(metricFor(model, "memory")?.availability).toBe("unavailable");
    expect(metricFor(model, "cpu")?.value).toBe(42);
  });
  it("masks stale values when the VM is unavailable", () => {
    for (const key of [
      "cpu",
      "memory",
      "disk",
      "networkRx",
      "networkTx",
      "uptime",
    ] as const)
      expect(metricFor(fixtures["Unavailable VM"]!, key)?.value).toBeNull();
  });
  it("retains known capability with missing runtime data", () => {
    expect(metricFor({ ...running, metrics: {} }, "memory")?.availability).toBe(
      "unavailable",
    );
  });
  it("validates the device and appearance config", () => {
    expect(() =>
      validateConfig({ type: "custom:proxmox-vm-card", device: "" }),
    ).toThrow();
    expect(() =>
      validateConfig({
        type: "custom:proxmox-vm-card",
        device: "device",
        progress_bars: { cpu: false },
      }),
    ).not.toThrow();
  });
});
