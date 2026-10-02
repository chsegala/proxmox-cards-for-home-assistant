import { LitElement, html, css, nothing } from "lit";
import type { HomeAssistant } from "../ha/types";
import { VmController, type VmResult } from "../ha/vm-controller";
import {
  enableRequired,
  requiredDisabled,
  entityStatus,
  type MetricFeature,
} from "../ha/editor-discovery";
import { validateConfig, type VmCardConfig } from "./config";
import {
  sections,
  overrideSchema,
  labels,
  formData,
  updateSection,
  type FormField,
} from "./editor-schema";

/** HA supplies ordinary controls; this wrapper adds discovery and explicit onboarding only. */
export class ProxmoxVmCardEditor extends LitElement {
  static properties = {
    config: { attribute: false },
    result: { attribute: false },
    hassValue: { attribute: false },
    feedback: { attribute: false },
    enabling: { attribute: false },
  };
  private config: VmCardConfig = { type: "custom:proxmox-vm-card", device: "" };
  private result: VmResult = { loading: false };
  private hassValue?: HomeAssistant;
  private feedback = "";
  private enabling = false;
  private errorFeedback = false;
  private controller = new VmController((result) => {
    this.result = result;
  });
  set hass(value: HomeAssistant) {
    this.hassValue = value;
    this.controller.update(value);
  }
  setConfig(config: VmCardConfig): void {
    validateConfig(
      {
        ...config,
        type: "custom:proxmox-vm-card",
        device: config.device ?? "",
      },
      true,
    );
    const changed =
      config.device !== this.config.device ||
      JSON.stringify(config.entities) !== JSON.stringify(this.config.entities);
    this.config = { ...config, device: config.device ?? "" };
    if (changed) {
      this.result = { loading: false };
      this.feedback = "";
      this.controller.configure(this.config.device, this.config.entities);
    }
  }
  override connectedCallback(): void {
    super.connectedCallback();
    this.controller.connect();
  }
  override disconnectedCallback(): void {
    this.controller.disconnect();
    super.disconnectedCallback();
  }
  private changed(
    schema: FormField[],
    event: CustomEvent<{ value: Record<string, unknown> }>,
  ): void {
    event.stopPropagation();
    const next = updateSection(this.config, schema, event.detail.value);
    try {
      validateConfig({ ...next, type: "custom:proxmox-vm-card" }, true);
      this.setConfig(next);
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: next },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      this.feedback =
        error instanceof Error ? error.message : "Invalid configuration.";
      this.errorFeedback = true;
    }
  }
  private async enable(feature: MetricFeature): Promise<void> {
    const binding = this.result.binding,
      hass = this.hassValue;
    if (this.enabling || !binding || !hass) return;
    this.enabling = true;
    const device = this.config.device;
    try {
      const result = await enableRequired(hass, binding, this.config, feature);
      if (device !== this.config.device) return;
      this.errorFeedback = result.failed.length > 0;
      this.feedback = `${result.enabled.length} entities enabled. ${result.restart ? "Restart Home Assistant to load them." : `Home Assistant reloads the integration${result.reloadDelay ? ` (about ${result.reloadDelay} seconds)` : ""}. Readings may be temporarily unavailable.`}${result.failed.map((f) => ` ${f.entity}: ${f.error}`).join("")}`;
      this.controller.retry();
    } catch (error) {
      this.errorFeedback = true;
      this.feedback =
        error instanceof Error
          ? error.message
          : "Home Assistant could not enable these entities.";
    } finally {
      this.enabling = false;
    }
  }
  private form(schema: FormField[]) {
    return html`<ha-form
      .hass=${this.hassValue}
      .data=${formData(this.config)}
      .schema=${schema}
      .computeLabel=${(field: FormField) => labels[field.name] ?? field.name}
      @value-changed=${(event: CustomEvent<{ value: Record<string, unknown> }>) => this.changed(schema, event)}
    ></ha-form>`;
  }
  protected override render() {
    const binding = this.result.binding;
    return html` ${sections.map(
        (section, index) =>
          html`<details ?open=${index === 0}>
            <summary>${section.title}</summary>
            ${this.form(section.schema)}
          </details>`,
      )}
      ${!this.config.device ? html`<p role="status">Select a VM device from the official Proxmox VE integration.</p>` : nothing}
      ${this.result.loading ? html`<p role="status">Discovering VM capabilities…</p>` : nothing}
      ${
        this.result.error
          ? html`<p role="alert">${this.result.error}</p>
              <button @click=${() => this.controller.retry()}>
                Retry discovery
              </button>`
          : nothing
      }
      ${
        binding
          ? (["cpu", "memory", "disk", "network"] as MetricFeature[]).map(
              (feature) => {
                const entities = requiredDisabled(
                  binding,
                  this.config,
                  feature,
                );
                return entities.length
                  ? html`<section>
                      <h3>${labels[feature]}</h3>
                      <p>
                        ${labels[feature]} requires ${entities.length} disabled
                        Home Assistant
                        ${entities.length === 1 ? "entity" : "entities"}.
                      </p>
                      <ul>
                        ${entities.map((e) => html`<li>${e.entity_id}</li>`)}
                      </ul>
                      ${this.hassValue?.user?.is_admin === true ? html`<button ?disabled=${this.enabling} @click=${() => this.enable(feature)}>Enable ${feature} metrics</button>` : html`<p>Enable these entities from the VM device page, or ask a Home Assistant administrator.</p>`}<a
                        href=${`/config/devices/device/${encodeURIComponent(this.config.device)}`}
                        >Open VM device page</a
                      >
                    </section>`
                  : nothing;
              },
            )
          : nothing
      }
      ${this.feedback ? html`<p role=${this.errorFeedback ? "alert" : "status"}>${this.feedback}</p>` : nothing}
      <details>
        <summary>Advanced</summary>
        <p>
          Sensor overrides are optional. Clearing a sensor restores automatic
          discovery.
        </p>
        ${this.form(overrideSchema)}
        <h3>Discovery diagnostics</h3>
        ${
          binding && this.hassValue
            ? html`
                <p>
                  Official Proxmox VE · ${binding.identity.name}<br />VM
                  ${binding.identity.vmId} · Node ${binding.identity.node}<br />Device:
                  ${binding.identity.deviceId}<br />State:
                  ${this.result.model?.state} · Source:
                  ${binding.sensors.status?.entity_id ?? "missing"}
                </p>
                <h4>Metrics and state source</h4>
                <ul>
                  ${overrideSchema[0]!.schema!.map(({ name }) => {
                    const role = name as keyof typeof binding.sensors;
                    const entity = binding.sensors[role];
                    return html`<li>
                      <strong>${labels[name]}</strong> —
                      ${entityStatus(entity, this.hassValue!, !!binding.overrides[role])}${entity ? html`<br /><code>${entity.entity_id}</code>` : nothing}${role === "memory" && this.result.model?.capabilities.memory === "available" && entity?.disabled_by ? html`<br />Memory reading derived from enabled percentage and total sensors.` : nothing}
                    </li>`;
                  })}
                </ul>
                <h4>Lifecycle actions</h4>
                <ul>
                  ${Object.entries(binding.actions).map(([id, entity]) => html`<li>${labels[id]} — ${entityStatus(entity, this.hassValue!)}<br /><code>${entity.entity_id}</code></li>`)}${["start", "shutdown", "reboot", "force-stop", "suspend", "resume"].filter((id) => !(id in binding.actions)).map((id) => html`<li>${labels[id]} — missing</li>`)}
                </ul>
              `
            : html`<p>Select a valid VM to inspect its capabilities.</p>`
        }
      </details>`;
  }
  static styles = css`
    :host {
      display: block;
      color: var(--primary-text-color);
    }
    details,
    section {
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      padding: 12px;
      margin: 0 0 12px;
    }
    summary {
      cursor: pointer;
      font-weight: 500;
      padding: 4px 0;
    }
    ha-form {
      display: block;
      margin-top: 12px;
    }
    p,
    li {
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
    h3,
    h4 {
      margin: 12px 0;
    }
    button {
      cursor: pointer;
      padding: 10px 14px;
      color: var(--primary-text-color);
      background: var(--secondary-background-color);
      border: 1px solid var(--divider-color);
      border-radius: 6px;
    }
    button:disabled {
      cursor: default;
      opacity: 0.5;
    }
    a {
      color: var(--primary-color);
      display: block;
      margin-top: 12px;
    }
    [role="alert"] {
      color: var(--error-color);
    }
  `;
}
