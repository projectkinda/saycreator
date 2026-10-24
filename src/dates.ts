/** Local-date helpers. Dates travel as YYYY-MM-DD strings. */
const pad = (n: number) => String(n).padStart(2, '0');

export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (s: string) => new Date(`${s}T00:00:00`);
export const addDays = (s: string, n: number) => {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const today = () => iso(new Date());

export const weekdayShort = (s: string) => parseDay(s).toLocaleDateString('en-GB', { weekday: 'short' });
/** "Tue 27 Oct" */
export const dayLabel = (s: string) =>
  parseDay(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
/** "27 Oct" */
export const dayMonth = (s: string) => parseDay(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const monthTitle = (s: string) => parseDay(s).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export const startOfMonth = (s: string) => {
  const d = parseDay(s);
  return iso(new Date(d.getFullYear(), d.getMonth(), 1));
};
export const endOfMonth = (s: string) => {
  const d = parseDay(s);
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};
export const addMonths = (s: string, n: number) => {
  const d = parseDay(s);
  return iso(new Date(d.getFullYear(), d.getMonth() + n, 1));
};
/** Monday on or before the date. */
export const mondayOnOrBefore = (s: string) => {
  const d = parseDay(s);
  return addDays(s, -((d.getDay() + 6) % 7));
};
