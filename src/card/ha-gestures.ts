interface GestureOptions {
  hasHold: boolean;
  hasDoubleClick: boolean;
}
interface HaActionHandler extends HTMLElement {
  bind(element: HTMLElement, options: GestureOptions): void;
}
/** Reuse the action-handler loaded by HA; standalone previews have no HA runtime. */
export function bindHaGestures(
  element: HTMLElement,
  options: GestureOptions,
): boolean {
  if (!customElements.get("action-handler")) return false;
  const handler = (document.body.querySelector("action-handler") ??
    document.createElement("action-handler")) as HaActionHandler;
  if (typeof handler.bind !== "function") return false;
  if (!handler.isConnected) document.body.append(handler);
  handler.bind(element, options);
  return true;
}
