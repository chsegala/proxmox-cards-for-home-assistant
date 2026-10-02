import type { VmCardConfig } from "../card/config";
import type { HomeAssistant, EntityEntry } from "./types";
import type { EntityRole, VmBinding } from "../proxmox/official-adapter";
import type { CapabilityStatus } from "../infrastructure/model";

export function entityStatus(
  entity: EntityEntry | undefined,
  hass: HomeAssistant,
  overridden = false,
): CapabilityStatus {
  if (!entity) return "missing";
  if (entity.disabled_by) return "disabled";
  if (
    !hass.states[entity.entity_id] ||
    hass.states[entity.entity_id]?.state === "unavailable"
  )
    return "unavailable";
  return overridden ? "overridden" : "available";
}
export type MetricFeature = "cpu" | "memory" | "disk" | "network";
/** Only dependencies exercised by a desired feature are proposed. Memory can use its existing derived path. */
export function requiredDisabled(
  binding: VmBinding,
  config: VmCardConfig,
  feature: MetricFeature,
): EntityEntry[] {
  if (config.metrics?.[feature] === false) return [];
  let roles: EntityRole[] =
    feature === "network"
      ? ["networkRx", "networkTx"]
      : feature === "disk"
        ? ["disk", "diskTotal"]
        : feature === "cpu"
          ? ["cpu"]
          : ["memory", "memoryTotal"];
  if (
    feature === "memory" &&
    !binding.overrides.memory &&
    (!binding.sensors.memory || binding.sensors.memory.disabled_by) &&
    binding.sensors.memoryPercentage &&
    binding.sensors.memoryTotal
  ) {
    const derived: EntityRole[] = ["memoryPercentage", "memoryTotal"];
    const count = (keys: EntityRole[]) =>
      keys.filter((key) => binding.sensors[key]?.disabled_by).length;
    if (!binding.sensors.memory || count(derived) < count(roles))
      roles = derived;
  }
  return [
    ...new Map(
      roles
        .map((role) => binding.sensors[role])
        .filter((e): e is EntityEntry => !!e?.disabled_by)
        .map((e) => [e.entity_id, e]),
    ).values(),
  ];
}
export interface EnableResult {
  enabled: string[];
  failed: { entity: string; error: string }[];
  restart: boolean;
  reloadDelay?: number;
}
export async function enableRequired(
  hass: HomeAssistant,
  binding: VmBinding,
  config: VmCardConfig,
  feature: MetricFeature,
): Promise<EnableResult> {
  if (hass.user?.is_admin !== true)
    throw new Error(
      "You do not have permission to enable these entities. Ask a Home Assistant administrator.",
    );
  const result: EnableResult = { enabled: [], failed: [], restart: false };
  for (const entity of requiredDisabled(binding, config, feature)) {
    try {
      const response = await hass.callWS<{
        require_restart?: boolean;
        reload_delay?: number;
      }>({
        type: "config/entity_registry/update",
        entity_id: entity.entity_id,
        disabled_by: null,
      });
      result.enabled.push(entity.entity_id);
      result.restart ||= !!response.require_restart;
      if (response.reload_delay !== undefined)
        result.reloadDelay = Math.max(
          result.reloadDelay ?? 0,
          response.reload_delay,
        );
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : "";
      const message =
        typeof error === "object" && error && "message" in error
          ? String(error.message)
          : "Home Assistant registry update failed.";
      result.failed.push({
        entity: entity.entity_id,
        error: /unauthorized|permission/i.test(code + message)
          ? "You do not have permission to enable this entity."
          : message,
      });
    }
  }
  return result;
}
