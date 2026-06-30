const OPT_OUT = new Set(['stop', 'unsubscribe', 'cancel', 'end', 'quit']);
const OPT_IN = new Set(['start', 'subscribe', 'resume']);

export function normalizedCommand(text: string) {
  return text.trim().toLowerCase().replace(/[^a-z]/g, '');
}

export function isOptOut(text: string) {
  return OPT_OUT.has(normalizedCommand(text));
}

export function isOptIn(text: string) {
  return OPT_IN.has(normalizedCommand(text));
}

export function envNumber(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function errorStatus(error: unknown): number | undefined {
  const value = error as any;
  const status = Number(value?.output?.statusCode ?? value?.statusCode ?? value?.status);
  return Number.isFinite(status) ? status : undefined;
}

export function shouldPauseConnection(status?: number) {
  return status === 403 || status === 411 || status === 440;
}

export function shouldRetrySend(error: unknown) {
  const status = errorStatus(error);
  return status !== 401 && status !== 403 && status !== 429;
}
