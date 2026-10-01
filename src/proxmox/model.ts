import type {
  CapabilityStatus,
  InfrastructureState,
  LifecycleAction,
  Metric,
} from "../infrastructure/model";
export interface VmIdentity {
  name: string;
  vmId: number;
  node: string;
  deviceId: string;
}
export type VmState = InfrastructureState;
export type VmMetric = Metric;
export type VmMetricKey =
  "cpu" | "memory" | "disk" | "networkRx" | "networkTx" | "uptime";
export type VmMetrics = Partial<Record<VmMetricKey, VmMetric>>;
export type VmAction = LifecycleAction;
export interface ProxmoxVmModel {
  identity: VmIdentity;
  state: VmState;
  metrics: VmMetrics;
  actions: readonly VmAction[];
  capabilities: Partial<Record<VmMetricKey, CapabilityStatus>>;
}
export function metricFor(
  model: ProxmoxVmModel,
  key: VmMetricKey,
): VmMetric | undefined {
  const capability = model.capabilities[key];
  if (!capability || capability === "missing" || capability === "disabled")
    return undefined;
  const metric = model.metrics[key];
  if (model.state === "unavailable" || capability === "unavailable" || !metric)
    return {
      value: null,
      unit: key === "cpu" ? "percent" : key === "uptime" ? "seconds" : "bytes",
      availability: "unavailable",
    };
  return metric;
}
