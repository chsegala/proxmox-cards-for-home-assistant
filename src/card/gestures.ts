import type { HomeAssistant } from "../ha/types";
export interface CardAction {
  action:
    | "none"
    | "more-info"
    | "navigate"
    | "url"
    | "perform-action"
    | "call-service"
    | "toggle"
    | "fire-dom-event";
  entity?: string;
  navigation_path?: string;
  navigation_replace?: boolean;
  url_path?: string;
  perform_action?: string;
  service?: string;
  data?: Record<string, unknown>;
  service_data?: Record<string, unknown>;
  target?: Record<string, unknown>;
  confirmation?: { text?: string; exemptions?: { user: string }[] };
  [key: string]: unknown;
}
export const gestureActions = [
  "none",
  "more-info",
  "navigate",
  "url",
  "perform-action",
  "call-service",
  "toggle",
  "fire-dom-event",
];
export function validateCardAction(value: unknown, name: string): void {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !gestureActions.includes((value as CardAction).action)
  )
    throw new Error(`${name} must contain a supported Home Assistant action.`);
  const action = value as CardAction;
  for (const key of [
    "entity",
    "navigation_path",
    "url_path",
    "perform_action",
    "service",
  ] as const)
    if (action[key] !== undefined && typeof action[key] !== "string")
      throw new Error(`${name}.${key} must be a string.`);
  if (action.action === "navigate" && !action.navigation_path)
    throw new Error(`${name} requires navigation_path.`);
  if (
    action.action === "url" &&
    (!action.url_path || !/^(https?:\/\/|\/)/i.test(action.url_path))
  )
    throw new Error(`${name} requires an http(s) URL or relative path.`);
  if (
    ["call-service", "perform-action"].includes(action.action) &&
    !/^[\w]+\.[\w]+$/.test(action.perform_action ?? action.service ?? "")
  )
    throw new Error(`${name} requires a domain.action service name.`);
  if (
    ["more-info", "toggle"].includes(action.action) &&
    action.entity !== undefined &&
    !/^\w+\.[\w]+$/.test(action.entity)
  )
    throw new Error(`${name}.entity must be an entity ID.`);
  if (action.action === "toggle" && !action.entity)
    throw new Error(`${name} requires an entity to toggle.`);
  for (const key of ["data", "service_data", "target", "confirmation"] as const)
    if (
      action[key] !== undefined &&
      (!action[key] ||
        typeof action[key] !== "object" ||
        Array.isArray(action[key]))
    )
      throw new Error(`${name}.${key} must be an object.`);
}
export async function executeCardAction(
  node: HTMLElement,
  hass: HomeAssistant,
  action: CardAction,
  fallbackEntity?: string,
): Promise<void> {
  if (action.action === "none") return;
  if (
    action.confirmation &&
    !action.confirmation.exemptions?.some((e) => e.user === hass.user?.id) &&
    !window.confirm(action.confirmation.text ?? "Run this action?")
  )
    return;
  const fire = (name: string, detail: unknown) =>
    node.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true }),
    );
  if (action.action === "more-info") {
    const entityId = action.entity ?? fallbackEntity;
    if (!entityId) throw new Error("Select an entity for More info.");
    fire("hass-more-info", { entityId });
  } else if (action.action === "navigate") {
    const url = new URL(action.navigation_path!, location.href);
    if (url.origin !== location.origin)
      throw new Error(
        "Navigation must stay within Home Assistant. Use Open URL for external links.",
      );
    if (action.navigation_replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
    window.dispatchEvent(
      new CustomEvent("location-changed", {
        detail: { replace: action.navigation_replace ?? false },
      }),
    );
  } else if (action.action === "url")
    window.open(action.url_path!, "_blank", "noopener,noreferrer");
  else if (action.action === "fire-dom-event") fire("ll-custom", action);
  else {
    const [domain, service] =
      action.action === "toggle"
        ? [action.entity!.split(".")[0], "toggle"]
        : (action.perform_action ?? action.service!).split(".");
    if (!hass.callService)
      throw new Error("Home Assistant action service is unavailable.");
    await hass.callService(
      domain!,
      service!,
      action.data ?? action.service_data,
      action.action === "toggle" ? { entity_id: action.entity } : action.target,
    );
  }
}
/** Pointer gestures: suppress tap after hold, movement, cancellation, and double tap. */
export class CardGestures {
  private holdTimer: ReturnType<typeof setTimeout> | undefined;
  private tapTimer: ReturnType<typeof setTimeout> | undefined;
  private point: { x: number; y: number; id: number } | undefined;
  private held = false;
  private suppress = false;
  constructor(
    private run: (gesture: "tap" | "hold" | "double_tap") => void,
    private enabled: (gesture: "hold" | "double_tap") => boolean,
  ) {}
  down = (event: PointerEvent): void => {
    if (event.button !== 0 || event.isPrimary === false) return;
    clearTimeout(this.holdTimer);
    this.point = { x: event.clientX, y: event.clientY, id: event.pointerId };
    this.held = false;
    this.suppress = false;
    if (this.enabled("hold"))
      this.holdTimer = setTimeout(() => {
        this.held = true;
        clearTimeout(this.tapTimer);
        this.tapTimer = undefined;
        this.run("hold");
      }, 500);
  };
  move = (event: PointerEvent): void => {
    if (
      this.point &&
      Math.hypot(event.clientX - this.point.x, event.clientY - this.point.y) >
        10
    )
      this.cancel();
  };
  up = (): void => {
    clearTimeout(this.holdTimer);
    this.point = undefined;
  };
  cancel = (): void => {
    this.up();
    this.suppress = true;
  };
  click = (): void => {
    if (this.held || this.suppress) {
      this.held = false;
      this.suppress = false;
      return;
    }
    if (!this.enabled("double_tap")) {
      this.run("tap");
      return;
    }
    if (this.tapTimer) {
      clearTimeout(this.tapTimer);
      this.tapTimer = undefined;
      this.run("double_tap");
    } else
      this.tapTimer = setTimeout(() => {
        this.tapTimer = undefined;
        this.run("tap");
      }, 250);
  };
  dispose(): void {
    clearTimeout(this.holdTimer);
    clearTimeout(this.tapTimer);
    this.tapTimer = undefined;
    this.point = undefined;
  }
}
