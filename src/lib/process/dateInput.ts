// <input type="date"> 用の Date ⇔ "YYYY-MM-DD" 変換。
// タイムゾーンのズレで日付が1日ずれないよう、UTC ではなくローカル日付で扱う。

// Date → "YYYY-MM-DD"（null は空文字）。
export function dateToInputValue(date: Date | null): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// "YYYY-MM-DD" → Date（その日のローカル0時。空文字は null）。
export function inputValueToDate(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
