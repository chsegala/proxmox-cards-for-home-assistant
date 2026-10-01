import type { HomeAssistant, Registry } from "./types";
import {
  discoverVm,
  normalizeVm,
  type EntityOverrides,
  type VmBinding,
} from "../proxmox/official-adapter";
import type { ProxmoxVmModel } from "../proxmox/model";
export interface VmResult {
  loading: boolean;
  model?: ProxmoxVmModel;
  error?: string;
}
/** Owns registry IO; runtime states are supplied by HA on every hass update. */
export class VmController {
  private hass: HomeAssistant | undefined;
  private device = "";
  private overrides: EntityOverrides = {};
  private binding: VmBinding | undefined;
  private generation = 0;
  private unsubscribe: (() => void)[] = [];
  private active = false;
  constructor(private readonly publish: (result: VmResult) => void) {}
  configure(device: string, overrides: EntityOverrides = {}): void {
    this.device = device;
    this.overrides = { ...overrides };
    this.reload();
  }
  connect(): void {
    this.active = true;
    this.reload();
  }
  disconnect(): void {
    this.active = false;
    this.generation++;
    this.binding = undefined;
    for (const unsubscribe of this.unsubscribe.splice(0)) unsubscribe();
  }
  update(hass: HomeAssistant): void {
    const changed = this.hass?.connection !== hass.connection;
    this.hass = hass;
    if (changed) this.reload();
    else if (this.active && this.binding)
      this.publish({
        loading: false,
        model: normalizeVm(this.binding, hass.states),
      });
  }
  retry(): void {
    this.reload();
  }
  private reload(): void {
    const generation = ++this.generation;
    this.binding = undefined;
    for (const unsubscribe of this.unsubscribe.splice(0)) unsubscribe();
    const hass = this.hass;
    if (!this.active || !hass || !this.device) return;
    this.publish({ loading: true });
    void this.load(hass, generation);
  }
  private async load(hass: HomeAssistant, generation: number): Promise<void> {
    const current = () => this.active && generation === this.generation;
    try {
      // Subscribe before reading to avoid missing registry changes during discovery.
      for (const event of [
        "device_registry_updated",
        "entity_registry_updated",
      ]) {
        const unsubscribe = await hass.connection.subscribeEvents(
          () => this.reload(),
          event,
        );
        if (!current()) {
          unsubscribe();
          return;
        }
        this.unsubscribe.push(unsubscribe);
      }
      const [devices, entities] = await Promise.all([
        hass.callWS<Registry["devices"]>({
          type: "config/device_registry/list",
        }),
        hass.callWS<Registry["entities"]>({
          type: "config/entity_registry/list",
        }),
      ]);
      if (!current()) return;
      this.binding = discoverVm(
        { devices, entities },
        this.device,
        this.overrides,
      );
      this.publish({
        loading: false,
        model: normalizeVm(this.binding, this.hass!.states),
      });
    } catch (error) {
      if (!current()) return;
      for (const unsubscribe of this.unsubscribe.splice(0)) unsubscribe();
      this.publish({
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Home Assistant registry access failed. Check your account permissions and connection.",
      });
    }
  }
}
