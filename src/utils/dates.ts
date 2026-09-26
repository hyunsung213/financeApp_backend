const KOREA_TIME_ZONE = 'Asia/Seoul';

function koreaDateParts(date: Date) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: KOREA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

export function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date must use YYYY-MM-DD format');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid date');
  return date;
}

export function dateOnly(date: Date): string {
  const { year, month, day } = koreaDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function daysInclusive(start: Date, end: Date): number {
  return Math.max(1, Math.floor((Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) / 86400000) + 1);
}

export function lastDayOfMonth(year: number, monthZeroBased: number): number { return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate(); }

export function salaryDate(year: number, monthZeroBased: number, salaryDay: number): Date {
  return new Date(Date.UTC(year, monthZeroBased, Math.min(salaryDay, lastDayOfMonth(year, monthZeroBased))));
}

export function currentCycleRange(today: Date, salaryDay: number): { startDate: Date; endDate: Date } {
  const { year, month } = koreaDateParts(today);
  const thisMonthSalary = salaryDate(year, month - 1, salaryDay);
  const startDate = dateOnly(today) >= dateOnly(thisMonthSalary) ? thisMonthSalary : salaryDate(year, month - 2, salaryDay);
  return { startDate, endDate: addDays(salaryDate(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, salaryDay), -1) };
}

export function nextSalaryDate(today: Date, salaryDay: number): Date {
  const { year, month } = koreaDateParts(today);
  const candidate = salaryDate(year, month - 1, salaryDay);
  return dateOnly(today) < dateOnly(candidate) ? candidate : salaryDate(year, month, salaryDay);
}
