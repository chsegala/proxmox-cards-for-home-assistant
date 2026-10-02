import {
  actionLabels,
  visibleActions,
  type LifecycleActionId,
} from "../infrastructure/model";
import type { HomeAssistant, Registry } from "./types";
import {
  discoverVm,
  normalizeVm,
  type EntityOverrides,
  type VmBinding,
} from "../proxmox/official-adapter";
import type { ProxmoxVmModel } from "../proxmox/model";
export interface ActionResult {
  pending: boolean;
  message?: string;
  error?: string;
}
export interface VmResult {
  loading: boolean;
  model?: ProxmoxVmModel;
  binding?: VmBinding;
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
  private actionPending = false;
  private awaitingState:
    | { state: ProxmoxVmModel["state"]; uptime: number | null; reboot: boolean }
    | undefined;
  constructor(
    private readonly publish: (result: VmResult) => void,
    private readonly publishAction: (result: ActionResult) => void = () => {},
  ) {}
  canPress(id: LifecycleActionId): boolean {
    if (!this.active || !this.hass || !this.binding || this.actionPending)
      return false;
    const entity = this.binding.actions[id];
    return (
      !!entity &&
      !entity.disabled_by &&
      !!this.hass.states[entity.entity_id] &&
      this.hass.states[entity.entity_id]!.state !== "unavailable" &&
      visibleActions(
        normalizeVm(this.binding, this.hass.states).state,
        normalizeVm(this.binding, this.hass.states).actions,
      ).some((action) => action.id === id)
    );
  }
  async press(id: LifecycleActionId, expectedDeviceId: string): Promise<void> {
    if (this.actionPending) return;
    if (
      this.binding?.identity.deviceId !== expectedDeviceId ||
      !this.canPress(id)
    ) {
      this.publishAction({
        pending: false,
        error:
          "VM state or action availability changed. Review the current card before trying again.",
      });
      return;
    }
    const generation = this.generation;
    const entity = this.binding.actions[id]!;
    const hass = this.hass!;
    const startingModel = normalizeVm(this.binding, hass.states);
    const startingState = startingModel.state;
    const startingUptime = startingModel.metrics.uptime?.value ?? null;
    this.awaitingState = undefined;
    this.actionPending = true;
    this.publishAction({
      pending: true,
      message: `Sending ${actionLabels[id]}…`,
    });
    try {
      await hass.callWS({
        type: "call_service",
        domain: "button",
        service: "press",
        target: { entity_id: entity.entity_id },
      });
      if (this.active && generation === this.generation) {
        const currentModel =
          this.binding && this.hass
            ? normalizeVm(this.binding, this.hass.states)
            : undefined;
        const uptimeReset =
          id === "reboot" &&
          startingUptime !== null &&
          currentModel?.metrics.uptime?.value != null &&
          currentModel.metrics.uptime.value < startingUptime;
        if (currentModel?.state === startingState && !uptimeReset) {
          this.awaitingState = {
            state: startingState,
            uptime: startingUptime,
            reboot: id === "reboot",
          };
          this.publishAction({
            pending: false,
            message: `${actionLabels[id]} request accepted. Waiting for Home Assistant state updates.`,
          });
        } else this.publishAction({ pending: false });
      }
    } catch (error) {
      if (this.active && generation === this.generation)
        this.publishAction({
          pending: false,
          error:
            error instanceof Error
              ? error.message
              : typeof error === "object" &&
                  error !== null &&
                  "message" in error
                ? String(error.message)
                : "Home Assistant could not send the action. Check permissions and connectivity.",
        });
    } finally {
      this.actionPending = false;
    }
  }
  configure(device: string, overrides: EntityOverrides = {}): void {
    this.awaitingState = undefined;
    this.publishAction({ pending: false });
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
    else if (this.active && this.binding) {
      const model = normalizeVm(this.binding, hass.states);
      if (
        this.awaitingState !== undefined &&
        (model.state !== this.awaitingState.state ||
          (this.awaitingState.reboot &&
            this.awaitingState.uptime !== null &&
            model.metrics.uptime?.value != null &&
            model.metrics.uptime.value < this.awaitingState.uptime))
      ) {
        this.awaitingState = undefined;
        this.publishAction({ pending: false });
      }
      this.publish({ loading: false, model, binding: this.binding });
    }
  }
  retry(): void {
    this.reload();
  }
  private reload(): void {
    this.awaitingState = undefined;
    this.publishAction({ pending: this.actionPending });
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
        binding: this.binding,
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
