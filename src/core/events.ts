export type EngineEvent = {
  type: string;
  timestamp: string;
  stage?: string;
  profile?: string;
  gate?: string;
  agent?: string;
  file?: string;
  model?: string;
  success?: boolean;
  data?: Record<string, unknown>;
};

let globalListener: ((event: EngineEvent) => void) | null = null;

export function setEngineEventListener(
  listener: ((event: EngineEvent) => void) | null,
) {
  globalListener = listener;
}

export function emitEngineEvent(
  event: Omit<EngineEvent, "timestamp">,
  local?: (e: EngineEvent) => void,
) {
  const enriched: EngineEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  if (local) {
    try {
      local(enriched);
    } catch {
      // ignore listener errors
    }
  }
  if (globalListener) {
    try {
      globalListener(enriched);
    } catch {
      // ignore global listener errors
    }
  }
}
