export const logger = {
  info: (...args: unknown[]) => console.error('[mcp-server] INFO', ...args),
  warn: (...args: unknown[]) => console.error('[mcp-server] WARN', ...args),
  error: (...args: unknown[]) => console.error('[mcp-server] ERROR', ...args),
};
