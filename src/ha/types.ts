export interface HaState {
  state: string;
  attributes: Record<string, unknown>;
}
export interface HaConnection {
  subscribeEvents(callback: () => void, event: string): Promise<() => void>;
}
export interface HomeAssistant {
  states: Record<string, HaState>;
  user?: { is_admin: boolean; id?: string };
  callService?(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): Promise<unknown>;
  connection: HaConnection;
  callWS<T>(
    message:
      | { type: string }
      | {
          type: "config/entity_registry/update";
          entity_id: string;
          disabled_by: null;
        }
      | {
          type: "call_service";
          domain: "button";
          service: "press";
          target: { entity_id: string };
        },
  ): Promise<T>;
}
export interface DeviceEntry {
  id: string;
  name: string | null;
  name_by_user: string | null;
  model: string | null;
  identifiers: [string, string][];
  via_device_id: string | null;
}
export interface EntityEntry {
  entity_id: string;
  device_id: string | null;
  platform: string;
  unique_id: string;
  translation_key?: string | null;
  disabled_by: string | null;
}
export interface Registry {
  devices: DeviceEntry[];
  entities: EntityEntry[];
}
