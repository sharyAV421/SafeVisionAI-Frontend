import type { AlertRecord, RiskEvent } from "./api";

export function eventEvidenceUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function eventConfidence(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? `${Math.round(value * 100)}%` : null;
}

export function mergeStreamEvent(events: RiskEvent[], event: RiskEvent): RiskEvent[] {
  return events.map(existing => existing.id === event.id ? { ...existing, ...event } : existing);
}

export function mergeStreamAlert(alerts: AlertRecord[], alert: AlertRecord): AlertRecord[] {
  const previous = alerts.find(item => item.id_alerta === alert.id_alerta);
  return previous ? alerts.map(item => item.id_alerta === alert.id_alerta ? { ...item, ...alert, event: { ...item.event, ...alert.event } } : item) : [alert, ...alerts];
}
