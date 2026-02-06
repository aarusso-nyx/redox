type Level = "info" | "debug" | "warn" | "error";

function log(level: Level, ...args: unknown[]) {
  switch (level) {
    case "debug":
      console.debug(...args);
      break;
    case "warn":
      console.warn(...args);
      break;
    case "error":
      console.error(...args);
      break;
    default:
      console.log(...args);
  }
}

export function logInfo(...args: unknown[]) {
  log("info", ...args);
}

export function logDebug(enabled: boolean, ...args: unknown[]) {
  if (!enabled) return;
  log("debug", ...args);
}

export function logWarn(...args: unknown[]) {
  log("warn", ...args);
}

export function logError(...args: unknown[]) {
  log("error", ...args);
}
