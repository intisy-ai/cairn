export interface ScreenContext {
  plugin: string;
  screenId: string;
  homeId: string;
  sources: Record<string, unknown>;
  invoke: (actionId: string, args: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}
