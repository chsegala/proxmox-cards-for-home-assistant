import { CardGestures, executeCardAction } from "./gestures";
import type { HomeAssistant } from "../ha/types";
import { VmController, type ActionResult } from "../ha/vm-controller";
import { LitElement, css, html, nothing } from "lit";
import {
  formatBytes,
  formatPercentage,
  formatUptime,
} from "../infrastructure/format";
import {
  actionLabels,
  visibleActions,
  type LifecycleActionId,
} from "../infrastructure/model";
import {
  metricFor,
  type ProxmoxVmModel,
  type VmMetricKey,
} from "../proxmox/model";
import {
  requiresConfirmation,
  validateConfig,
  type VmCardConfig,
} from "./config";

/** Presentation boundary. HA adapters supply normalized data; no discovery lives here. */
export class ProxmoxVmCard extends LitElement {
  static getConfigElement(): HTMLElement {
    return document.createElement("proxmox-vm-card-editor");
  }
  static getStubConfig() {
    return { device: "" };
  }
  static properties = {
    model: { attribute: false },
    loading: { type: Boolean },
    config: { attribute: false },
    error: { attribute: false },
    actionResult: { attribute: false },
    confirmation: { attribute: false },
  };
  model: ProxmoxVmModel | undefined;
  loading = false;
  private config: VmCardConfig | undefined;
  private hassValue?: HomeAssistant;
  private gestureError: string | undefined;
  private gestureEntity: string | undefined;
  private readonly gestures = new CardGestures(
    (gesture) => void this.runGesture(gesture),
    (gesture) => {
      const action =
        this.config?.[gesture === "hold" ? "hold_action" : "double_tap_action"];
      return Boolean(action && action.action !== "none");
    },
  );
  private surfaceEvent(event: Event): boolean {
    return !event
      .composedPath()
      .some(
        (node) =>
          node instanceof Element &&
          node.matches(
            "button, summary, details, dialog, a, input, select, textarea",
          ),
      );
  }
  private async runGesture(
    gesture: "tap" | "hold" | "double_tap",
  ): Promise<void> {
    if (!this.usesHomeAssistant || !this.hassValue || this.confirmation) return;
    const action = this.config?.[
      gesture === "tap"
        ? "tap_action"
        : gesture === "hold"
          ? "hold_action"
          : "double_tap_action"
    ] ?? { action: gesture === "tap" ? "more-info" : "none" };
    try {
      await executeCardAction(this, this.hassValue, action, this.gestureEntity);
      this.gestureError = undefined;
    } catch (error) {
      this.gestureError =
        error instanceof Error ? error.message : "Card action failed.";
    }
    this.requestUpdate();
  }

  private error: string | undefined;
  private actionResult: ActionResult = { pending: false };
  private confirmation:
    { id: LifecycleActionId; deviceId: string; name: string } | undefined;
  private async requestAction(id: LifecycleActionId): Promise<void> {
    if (
      this.confirmation ||
      !this.usesHomeAssistant ||
      !this.model ||
      this.config?.actions?.[id] === false ||
      !this.live.canPress(id)
    )
      return;
    const deviceId = this.model.identity.deviceId;
    const overflow = this.shadowRoot?.querySelector("details");
    if (overflow) overflow.open = false;
    if (requiresConfirmation(this.config, id)) {
      this.confirmation = { id, deviceId, name: this.model.identity.name };
      await this.updateComplete;
      this.shadowRoot?.querySelector("dialog")?.showModal();
    } else await this.live.press(id, deviceId);
  }
  private cancelAction(): void {
    this.shadowRoot?.querySelector("dialog")?.close();
    this.confirmation = undefined;
  }
  private async confirmAction(): Promise<void> {
    const confirmation = this.confirmation;
    this.cancelAction();
    if (confirmation)
      await this.live.press(confirmation.id, confirmation.deviceId);
  }
  protected get usesHomeAssistant(): boolean {
    return true;
  }
  private readonly live = new VmController(
    (result) => {
      this.gestureEntity =
        result.binding?.sensors.status?.entity_id ??
        result.binding?.sensors.cpu?.entity_id;
      this.loading = result.loading;
      this.model = result.model;
      this.error = result.error;
      if (
        this.confirmation &&
        result.model?.identity.deviceId !== this.confirmation.deviceId
      )
        this.cancelAction();
    },
    (result) => {
      this.actionResult = result;
    },
  );
  set hass(value: HomeAssistant) {
    this.hassValue = value;
    if (this.usesHomeAssistant) this.live.update(value);
  }
  override connectedCallback(): void {
    super.connectedCallback();
    if (this.usesHomeAssistant) this.live.connect();
  }
  override disconnectedCallback(): void {
    this.cancelAction();
    this.gestures.dispose();
    this.live.disconnect();
    super.disconnectedCallback();
  }

  setConfig(config: VmCardConfig): void {
    validateConfig(config, true);
    this.cancelAction();
    this.gestures.dispose();
    const discoveryChanged =
      this.config?.device !== config.device ||
      JSON.stringify(this.config?.entities) !== JSON.stringify(config.entities);
    this.config = { ...config };
    if (this.usesHomeAssistant && discoveryChanged) {
      this.model = undefined;
      this.error = undefined;
      this.loading = false;
      this.live.configure(config.device, config.entities);
    }
  }
  getCardSize(): number {
    return this.config?.layout === "compact"
      ? 3
      : this.config?.layout === "detailed"
        ? 6
        : 5;
  }

  private metric(key: VmMetricKey, label: string) {
    const model = this.model;
    if (!model) return nothing;
    if (
      key !== "uptime" &&
      this.config?.metrics?.[
        key.startsWith("network")
          ? "network"
          : (key as "cpu" | "memory" | "disk")
      ] === false
    )
      return nothing;
    const metric = metricFor(model, key);
    if (!metric) return nothing;
    const available =
      metric.availability === "available" &&
      metric.value !== null &&
      Number.isFinite(metric.value) &&
      metric.value >= 0;
    const value = metric.value ?? 0;
    const percentage =
      metric.percentage ??
      (key === "cpu"
        ? value
        : metric.total && metric.total > 0
          ? (value / metric.total) * 100
          : undefined);
    const showPercentage =
      key === "cpu" ||
      (key === "memory"
        ? this.config?.memory_percentage !== false
        : this.config?.disk_percentage !== false);
    const bars = this.config?.progress_bars;
    const showBar =
      typeof bars === "boolean"
        ? bars
        : bars?.[key as "cpu" | "memory" | "disk"] !== false;
    return html`<section class="metric" aria-label=${label}>
      <div class="metric-heading">
        <h3>${label}</h3>
        ${available && showPercentage && key !== "cpu" && percentage !== undefined && ["memory", "disk"].includes(key) ? html`<span class="percentage">${formatPercentage(percentage)}</span>` : nothing}
      </div>
      <div class="value">
        ${available ? (key === "cpu" ? formatPercentage(value) : html`${formatBytes(value)}${metric.total !== undefined ? html`<span class="total"> / ${formatBytes(metric.total)}</span>` : nothing}`) : "Unavailable"}
      </div>
      ${available && showBar && percentage !== undefined && ["cpu", "memory", "disk"].includes(key) ? html`<progress max="100" value=${Math.min(100, Math.max(0, percentage))} aria-label=${`${label} utilization`}></progress>` : nothing}
      ${!available && showBar && ["cpu", "memory", "disk"].includes(key) ? html`<div class="unavailable-bar" role="img" aria-label=${`${label} utilization unavailable`}></div>` : nothing}
    </section>`;
  }

  protected render() {
    const layout = this.config?.layout ?? "standard";
    if (this.config && !this.config.device.trim())
      return html`<ha-card
        ><div class="placeholder" role="status">
          Select a VM device from the official Proxmox VE integration.
        </div></ha-card
      >`;
    if (this.error)
      return html`<ha-card
        ><div class="placeholder" role="alert">
          ${this.error}<button @click=${() => this.live.retry()}>Retry</button>
        </div></ha-card
      >`;
    if (this.loading)
      return html`<ha-card
        ><div class="placeholder" role="status" aria-busy="true">
          Loading VM…
        </div></ha-card
      >`;
    const model = this.model;
    if (!model)
      return html`<ha-card
        ><div class="placeholder" role="status">
          Waiting for VM data
        </div></ha-card
      >`;
    const stateLabel = {
      running: "Running",
      stopped: "Stopped",
      suspended: "Suspended",
      unavailable: "Unavailable",
      unknown: "Unknown",
    }[model.state];
    const uptime = metricFor(model, "uptime");
    const uptimeAvailable =
      uptime?.availability === "available" &&
      uptime.value !== null &&
      Number.isFinite(uptime.value) &&
      uptime.value >= 0;
    const status =
      model.state === "running"
        ? uptimeAvailable
          ? formatUptime(uptime.value!)
          : uptime
            ? "Uptime unavailable"
            : stateLabel
        : stateLabel;
    const showMetrics =
      model.state !== "stopped" && model.state !== "suspended";
    const actions = visibleActions(model.state, model.actions).filter(
      (action) => this.config?.actions?.[action.id] !== false,
    );
    const routine = actions.filter((action) => action.id !== "force-stop");
    const forceStop = actions.find((action) => action.id === "force-stop");
    return html`<ha-card
      class=${`${layout} ${this.config?.state_accent === false ? "" : "accent"}`}
      data-state=${model.state}
      @pointerdown=${(event: PointerEvent) => {
        if (this.surfaceEvent(event)) this.gestures.down(event);
      }}
      @pointermove=${this.gestures.move}
      @pointerup=${this.gestures.up}
      @pointercancel=${this.gestures.cancel}
      @pointerleave=${this.gestures.cancel}
      @click=${(event: MouseEvent) => {
        if (this.surfaceEvent(event)) this.gestures.click();
      }}
      @contextmenu=${(event: Event) => {
        if (
          this.surfaceEvent(event) &&
          this.config?.hold_action &&
          this.config.hold_action.action !== "none"
        )
          event.preventDefault();
      }}
      @keydown=${(event: KeyboardEvent) => {
        if (
          event.target === event.currentTarget &&
          ["Enter", " "].includes(event.key)
        ) {
          event.preventDefault();
          void this.runGesture("tap");
        }
      }}
      tabindex="0"
      aria-label=${this.config?.title ?? model.identity.name}
    >
      ${this.gestureError ? html`<small role="alert">Last occurred error: ${this.gestureError}</small>` : nothing}
      <header>
        <div class="icon" aria-hidden="true">
          ${
            customElements.get("ha-icon")
              ? html`<ha-icon
                  .icon=${this.config?.icon ?? "mdi:desktop-tower"}
                ></ha-icon>`
              : html`<svg viewBox="0 0 24 24" width="24" height="24">
                  <rect
                    x="3"
                    y="3"
                    width="18"
                    height="13"
                    rx="2"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                  />
                  <path
                    d="M8 21h8M12 16v5"
                    stroke="currentColor"
                    stroke-width="1.6"
                  />
                </svg>`
          }
        </div>
        <div class="identity">
          <h2>${this.config?.title || model.identity.name}</h2>
          <p>${model.identity.node} · VM ${model.identity.vmId}</p>
        </div>
        <div
          class="status"
          title=${stateLabel}
          aria-label=${`${stateLabel}${model.state === "running" ? ` · ${status}` : ""}`}
        >
          <span aria-hidden="true"
            >${model.state === "running" ? "●" : model.state === "suspended" ? "Ⅱ" : model.state === "stopped" ? "■" : "◇"}</span
          >
          ${status}
        </div>
      </header>
      ${model.state === "unavailable" ? html`<p class="notice" role="status">VM unavailable. Current readings cannot be retrieved.</p>` : nothing}
      ${
        showMetrics &&
        ["cpu", "memory", "disk"].some(
          (key) =>
            this.config?.metrics?.[key as "cpu" | "memory" | "disk"] !==
              false && metricFor(model, key as "cpu" | "memory" | "disk"),
        )
          ? html`<div class="metrics">
              ${this.metric("cpu", "CPU")}${this.metric("memory", "Memory")}${this.metric("disk", "Disk")}
            </div>`
          : nothing
      }
      ${
        showMetrics &&
        this.config?.metrics?.network !== false &&
        (metricFor(model, "networkRx") || metricFor(model, "networkTx"))
          ? html`<section class="network">
              <h3>Network <span>· cumulative totals</span></h3>
              <div class="network-values">
                ${this.metric("networkRx", "↓ Received")}${this.metric("networkTx", "↑ Sent")}
              </div>
            </section>`
          : nothing
      }
      ${
        layout === "detailed"
          ? html`<dl>
              <dt>Device ID</dt>
              <dd>${model.identity.deviceId}</dd>
              <dt>State</dt>
              <dd>${stateLabel}</dd>
            </dl>`
          : nothing
      }
      ${
        actions.length || this.actionResult.error
          ? html`<footer>
              <div class="actions">
                ${routine.map((action) => html`<button ?disabled=${!this.usesHomeAssistant || this.actionResult.pending || !this.live.canPress(action.id)} title=${this.usesHomeAssistant ? actionLabels[action.id] : "Lifecycle actions are not connected in this preview"} @click=${() => this.requestAction(action.id)}>${actionLabels[action.id]}</button>`)}${
                  forceStop
                    ? html`<details class="overflow">
                        <summary aria-label="More lifecycle actions">⋮</summary>
                        <div class="danger-menu">
                          <button
                            ?disabled=${!this.usesHomeAssistant || this.actionResult.pending || !this.live.canPress("force-stop")}
                            @click=${() => this.requestAction("force-stop")}
                          >
                            Force Stop</button
                          ><small
                            >${this.usesHomeAssistant ? "Immediately stops the VM" : "Destructive action · preview only"}</small
                          >
                        </div>
                      </details>`
                    : nothing
                }
              </div>
              ${this.actionResult.error ? html`<small class="preview" role="alert">Last occurred error: ${this.actionResult.error}</small>` : this.config?.show_action_status === false ? nothing : this.usesHomeAssistant ? html`<small class="preview" role="status">${this.actionResult.message ?? "Lifecycle controls"}</small>` : html`<small class="preview">Lifecycle controls · preview only</small>`}
            </footer>`
          : nothing
      }
      ${
        this.confirmation
          ? html`<dialog
              @cancel=${() => this.cancelAction()}
              aria-labelledby="action-title"
              aria-describedby="action-description"
            >
              <h2 id="action-title">
                ${actionLabels[this.confirmation.id]} ${this.confirmation.name}?
              </h2>
              <p id="action-description">
                ${this.confirmation.id === "force-stop" ? "This immediately stops the VM without a graceful shutdown and may cause data loss." : this.confirmation.id === "shutdown" ? "This requests a graceful shutdown of the VM." : this.confirmation.id === "reboot" ? "This restarts the VM and interrupts its services." : this.confirmation.id === "suspend" ? "This suspends the VM in memory and pauses its services." : this.confirmation.id === "start" ? "This starts the VM." : "This resumes the suspended VM."}
              </p>
              <div class="confirmation-actions">
                <button autofocus @click=${() => this.cancelAction()}>
                  Cancel</button
                ><button
                  class=${this.confirmation.id === "force-stop" ? "danger" : ""}
                  @click=${() => this.confirmAction()}
                >
                  ${actionLabels[this.confirmation.id]}
                </button>
              </div>
            </dialog>`
          : nothing
      }
    </ha-card>`;
  }

  static styles = css`
    dialog {
      max-width: min(420px, calc(100vw - 64px));
      border: 1px solid var(--divider-color, #dce3ea);
      border-radius: 12px;
      padding: 24px;
      background: var(--ha-card-background, var(--card-background-color, #fff));
      color: var(--primary-text-color, #182637);
    }
    dialog::backdrop {
      background: #0006;
    }
    dialog p {
      line-height: 1.5;
    }
    .confirmation-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .danger {
      color: var(--error-color, #b64545);
    }

    :host {
      display: block;
      min-width: 0;
      color: var(--primary-text-color, #182637);
      font-family: var(--paper-font-body1_-_font-family, system-ui, sans-serif);
    }
    * {
      box-sizing: border-box;
    }
    ha-card {
      display: block;
      padding: 22px;
      background: var(--ha-card-background, var(--card-background-color, #fff));
      border: 1px solid var(--divider-color, #dce3ea);
      border-radius: var(--ha-card-border-radius, 16px);
      box-shadow: var(--ha-card-box-shadow, 0 3px 14px #15283c08);
      overflow: visible;
    }
    header {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .icon {
      display: grid;
      place-items: center;
      flex: 0 0 42px;
      height: 42px;
      border-radius: 12px;
      background: var(--secondary-background-color, #f1f5f8);
      color: var(--primary-color, #397b99);
    }
    .identity {
      flex: 1;
      min-width: 100px;
    }
    h2 {
      font-size: 17px;
      line-height: 1.3;
      margin: 0;
      font-weight: 650;
      overflow-wrap: normal;
    }
    p {
      margin: 5px 0 0;
    }
    .identity p,
    .total,
    .percentage,
    small,
    dt {
      color: var(--secondary-text-color, #687789);
      font-size: 12px;
    }
    .status {
      font-size: 13px;
      line-height: 1.5;
      overflow-wrap: normal;
    }
    .status span {
      margin-right: 4px;
    }
    .accent[data-state="running"] .status span {
      color: var(--success-color, #21865d);
    }
    .accent[data-state="suspended"] .status span {
      color: var(--warning-color, #ac750a);
    }
    h3 {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: 650;
      color: var(--secondary-text-color, #687789);
      margin: 0 0 9px;
    }
    .metrics {
      display: flex;
      flex-wrap: wrap;
      gap: 22px 16px;
      margin: 26px 0;
    }
    .metric {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .metric .value {
      flex: 1;
      white-space: nowrap;
    }
    .metrics .metric {
      flex: 1 0 auto;
      width: max-content;
      max-width: 100%;
    }
    .value {
      font-size: 19px;
      white-space: nowrap;
      font-weight: 600;
      overflow-wrap: normal;
      line-height: 1.5;
    }
    .total {
      display: inline-block;
      white-space: nowrap;
      font-weight: 400;
    }
    progress {
      display: block;
      width: 100%;
      height: 5px;
      border: 0;
      border-radius: 8px;
      overflow: hidden;
      margin-top: 10px;
      accent-color: var(--primary-color, #397b99);
      background: var(--secondary-background-color, #edf1f4);
    }
    progress::-webkit-progress-bar {
      background: var(--secondary-background-color, #edf1f4);
    }
    progress::-webkit-progress-value {
      background: var(--primary-color, #397b99);
      border-radius: 8px;
    }
    progress::-moz-progress-bar {
      background: var(--primary-color, #397b99);
    }
    .metric-heading {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 9px;
    }
    .metric-heading h3 {
      margin: 0;
    }
    .percentage {
      white-space: nowrap;
    }
    .unavailable-bar {
      height: 5px;
      border-radius: 8px;
      margin-top: 10px;
      background: var(--divider-color, #dce3ea);
    }

    .network {
      border-top: 1px solid var(--divider-color, #dce3ea);
      padding-top: 18px;
    }
    .network h3 span {
      letter-spacing: 0;
      text-transform: none;
      font-weight: 400;
    }
    .network-values {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 110px), 1fr));
      gap: 12px;
    }
    .network .value {
      font-size: 16px;
    }
    .network .metric h3 {
      font-size: 11px;
      letter-spacing: 0;
      text-transform: none;
    }
    footer {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--divider-color, #dce3ea);
    }
    .actions {
      display: flex;
      flex-wrap: nowrap;
      gap: 6px;
      align-items: center;
    }
    .actions > button {
      flex: 1 1 0;
      padding-inline: 6px;
      white-space: nowrap;
    }
    .actions summary {
      padding-inline: 8px;
      white-space: nowrap;
    }
    button,
    summary {
      font: inherit;
      font-size: 12px;
      border: 1px solid var(--divider-color, #dce3ea);
      border-radius: 8px;
      padding: 9px 12px;
      background: var(--secondary-background-color, #f5f7f9);
      color: var(--secondary-text-color, #687789);
    }
    button:disabled {
      cursor: not-allowed;
    }
    summary {
      cursor: pointer;
      list-style: none;
      font-size: 18px;
      padding: 4px 12px;
    }
    summary::-webkit-details-marker {
      display: none;
    }
    summary:focus-visible {
      outline: 2px solid var(--primary-color, #397b99);
      outline-offset: 2px;
    }
    .overflow {
      position: relative;
      flex: 0 0 auto;
      margin-left: 0;
    }
    .overflow[open] {
      z-index: 2;
    }
    .danger-menu {
      position: absolute;
      right: 0;
      bottom: calc(100% + 8px);
      width: 190px;
      padding: 12px;
      background: var(--ha-card-background, var(--card-background-color, #fff));
      border: 1px solid var(--divider-color, #dce3ea);
      border-top: 2px solid var(--error-color, #b64545);
      border-radius: 8px;
      box-shadow: 0 6px 24px #0003;
    }
    .danger-menu button {
      color: var(--error-color, #b64545);
    }
    .danger-menu small {
      display: block;
      margin-top: 6px;
    }
    .preview {
      display: block;
      margin-top: 10px;
    }
    .notice {
      font-size: 13px;
      color: var(--secondary-text-color, #687789);
      padding-top: 12px;
    }
    .placeholder {
      padding: 24px;
      color: var(--secondary-text-color, #687789);
    }
    dl {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 8px 16px;
      border-top: 1px solid var(--divider-color, #dce3ea);
      padding-top: 16px;
    }
    dd {
      margin: 0;
      font-size: 12px;
      overflow-wrap: normal;
    }
    .compact {
      padding: 16px;
    }
    .compact .metrics {
      margin: 18px 0;
      gap: 12px;
    }
    .compact .network {
      padding-top: 12px;
    }
    .compact footer {
      margin-top: 12px;
      padding-top: 12px;
    }
    .detailed .metrics {
      gap: 24px;
    }
    @media (max-width: 350px) {
      ha-card {
        padding: 16px;
      }
      .status {
        flex-basis: 100%;
        padding-left: 54px;
      }
      .metrics {
        gap: 16px;
      }
    }
  `;
}
