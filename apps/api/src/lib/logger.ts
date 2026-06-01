type Level = 'info' | 'warn' | 'error'

function write(level: Level, service: string, msg: string, data?: Record<string, unknown>) {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    service,
    msg,
    ...data,
  }
  const out = JSON.stringify(entry)
  if (level === 'error') {
    process.stderr.write(out + '\n')
  } else {
    process.stdout.write(out + '\n')
  }
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { error: err.message, stack: err.stack }
  return { error: String(err) }
}

export const log = {
  info: (service: string, msg: string, data?: Record<string, unknown>) =>
    write('info', service, msg, data),
  warn: (service: string, msg: string, data?: Record<string, unknown>) =>
    write('warn', service, msg, data),
  error: (service: string, msg: string, err?: unknown, data?: Record<string, unknown>) =>
    write('error', service, msg, { ...serializeError(err), ...data }),
}
