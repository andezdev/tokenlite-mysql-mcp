/** Log levels (same names as MCP logging levels). */
export type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';
export type LogFn = (level: LogLevel, data: unknown, logger?: string) => void | Promise<void>;

/** Default logger for engines created with createEngine(): one line per message on stderr. */
export const stderrLog: LogFn = (level, data, logger) => {
    const prefix = logger ? `[${logger}]` : '[tokenlite-mysql-mcp]';
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    console.error(`${prefix} [${level}] ${msg}`);
};
