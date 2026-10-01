import { expect, it, vi } from "vitest";
import { VmController, type VmResult } from "../src/ha/vm-controller";
import type { HomeAssistant } from "../src/ha/types";
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
it("cleans subscriptions and rejects stale responses after disconnect", async () => {
  const unsubscribe = vi.fn();
  let finish!: (value: unknown[]) => void;
  const pending = new Promise<unknown[]>((resolve) => {
    finish = resolve;
  });
  const hass: HomeAssistant = {
    states: {},
    connection: { subscribeEvents: async () => unsubscribe },
    callWS: async <T>() => (await pending) as T,
  };
  const results: VmResult[] = [];
  const controller = new VmController((result) => results.push(result));
  controller.configure("vm");
  controller.update(hass);
  controller.connect();
  await flush();
  controller.disconnect();
  finish([]);
  await flush();
  expect(unsubscribe).toHaveBeenCalledTimes(2);
  expect(results).toEqual([{ loading: true }]);
});
it("surfaces registry errors and retries on request", async () => {
  const unsubscribe = vi.fn();
  const callWS = vi.fn().mockRejectedValue(new Error("Access denied"));
  const hass: HomeAssistant = {
    states: {},
    connection: { subscribeEvents: async () => unsubscribe },
    callWS,
  };
  const results: VmResult[] = [];
  const controller = new VmController((result) => results.push(result));
  controller.configure("vm");
  controller.update(hass);
  controller.connect();
  await flush();
  expect(results.at(-1)?.error).toBe("Access denied");
  expect(unsubscribe).toHaveBeenCalledTimes(2);
  controller.retry();
  await flush();
  expect(callWS).toHaveBeenCalledTimes(4);
  controller.disconnect();
});
