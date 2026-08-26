// Compact number formatting for idle-scale values: 1234 -> "1.23K", 4.5e6 -> "4.50M", etc.
const UNITS = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

export function fmt(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n < 0) return "-" + fmt(-n);
  if (n < 1000) return Math.floor(n).toString();
  const i = Math.floor(Math.log10(n) / 3);
  if (i < UNITS.length) {
    const v = n / Math.pow(1000, i);
    return (v >= 100 ? v.toFixed(0) : v.toFixed(2)) + UNITS[i];
  }
  return n.toExponential(2).replace("e+", "e");
}

// Short duration formatting for the "while you were away" popup.
export function fmtDuration(seconds: number): string {
  seconds = Math.floor(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
