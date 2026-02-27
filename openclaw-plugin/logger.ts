type Logger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  debugRequest: (op: string, data: unknown) => void;
  debugResponse: (op: string, data: unknown) => void;
};

let _logger: Logger | null = null;
let _debug = false;

export function initLogger(logger: Logger, debug: boolean): void {
  _logger = logger;
  _debug = debug;
}

export const log: Logger = {
  info: (...args: unknown[]) => _logger?.info(...args),
  warn: (...args: unknown[]) => _logger?.warn(...args),
  error: (...args: unknown[]) => _logger?.error(...args),
  debug: (...args: unknown[]) => {
    if (_debug) _logger?.info("[debug]", ...args);
  },
  debugRequest: (op: string, data: unknown) => {
    if (_debug) _logger?.info(`[debug] → ${op}:`, JSON.stringify(data));
  },
  debugResponse: (op: string, data: unknown) => {
    if (_debug) _logger?.info(`[debug] ← ${op}:`, JSON.stringify(data));
  },
};