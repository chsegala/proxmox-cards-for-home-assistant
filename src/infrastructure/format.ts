export function formatPercentage(value: number): string {
  return Number.isFinite(value)
    ? `${Math.min(100, Math.max(0, value)).toFixed(0)}%`
    : "Unavailable";
}
/** Decimal SI units: cumulative bytes are never converted into rates. */
export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "Unavailable";
  const units = ["B", "kB", "MB", "GB", "TB", "PB"];
  const index =
    value === 0
      ? 0
      : Math.min(Math.floor(Math.log10(value) / 3), units.length - 1);
  return `${Number((value / 1000 ** index).toFixed(index === 0 ? 0 : 1))} ${units[index]}`;
}
export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "Unavailable";
  const minutes = Math.floor(seconds / 60),
    hours = Math.floor(minutes / 60),
    days = Math.floor(hours / 24);
  return days
    ? `${days}d ${hours % 24}h`
    : hours
      ? `${hours}h ${minutes % 60}m`
      : minutes
        ? `${minutes}m`
        : "<1m";
}
