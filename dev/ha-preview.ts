/** Development-only HA harness. Never imported by the production entry. */
import "../src/index";
import { ProxmoxVmCard } from "../src/card/proxmox-vm-card";
import type { VmCardConfig } from "../src/card/config";
import { fixtures } from "./fixtures";

type PreviewConfig = Omit<VmCardConfig, "type" | "device"> & {
  type: string;
  device?: string;
  fixture?: string;
};
class ProxmoxVmTestCard extends ProxmoxVmCard {
  override setConfig(config: PreviewConfig): void {
    const name = config.fixture ?? "Running healthy";
    if (name !== "Loading" && !Object.hasOwn(fixtures, name)) {
      throw new Error(`Unknown test fixture: ${name}`);
    }
    super.setConfig({
      ...config,
      type: "custom:proxmox-vm-card",
      device: "test-fixture",
    });
    this.loading = name === "Loading";
    this.model = fixtures[name];
  }
}
if (!customElements.get("proxmox-vm-test-card")) {
  customElements.define("proxmox-vm-test-card", ProxmoxVmTestCard);
}
