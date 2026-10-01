/** Registry status is distinct from runtime metric availability. */
export type CapabilityStatus =
  "available" | "unavailable" | "disabled" | "missing" | "overridden";
export type InfrastructureState =
  "running" | "stopped" | "suspended" | "unavailable" | "unknown";
export interface Metric {
  value: number | null;
  unit: "bytes" | "percent" | "seconds";
  total?: number;
  percentage?: number;
  availability: "available" | "unavailable";
}
export type LifecycleActionId =
  "start" | "shutdown" | "reboot" | "force-stop" | "suspend" | "resume";
export interface LifecycleAction {
  id: LifecycleActionId;
  capability: CapabilityStatus;
}
export const actionLabels: Record<LifecycleActionId, string> = {
  start: "Start",
  shutdown: "Shutdown",
  reboot: "Reboot",
  "force-stop": "Force Stop",
  suspend: "Suspend",
  resume: "Resume",
};
export const defaultConfirmations: Record<LifecycleActionId, boolean> = {
  start: false,
  shutdown: true,
  reboot: true,
  "force-stop": true,
  suspend: true,
  resume: false,
};
export function visibleActions(
  state: InfrastructureState,
  actions: readonly LifecycleAction[],
): LifecycleAction[] {
  const allowed: LifecycleActionId[] =
    state === "running"
      ? ["shutdown", "reboot", "suspend", "force-stop"]
      : state === "stopped"
        ? ["start"]
        : state === "suspended"
          ? ["resume", "force-stop"]
          : [];
  return allowed.flatMap((id) =>
    actions.filter(
      (action) =>
        action.id === id &&
        (action.capability === "available" ||
          action.capability === "overridden"),
    ),
  );
}
