export function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date must use YYYY-MM-DD format');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid date');
  return date;
}

export function dateOnly(date: Date): string { return date.toISOString().slice(0, 10); }

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
  const thisMonthSalary = salaryDate(today.getUTCFullYear(), today.getUTCMonth(), salaryDay);
  const startDate = today >= thisMonthSalary ? thisMonthSalary : salaryDate(today.getUTCFullYear(), today.getUTCMonth() - 1, salaryDay);
  return { startDate, endDate: addDays(salaryDate(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, salaryDay), -1) };
}

export function nextSalaryDate(today: Date, salaryDay: number): Date {
  const candidate = salaryDate(today.getUTCFullYear(), today.getUTCMonth(), salaryDay);
  return today < candidate ? candidate : salaryDate(today.getUTCFullYear(), today.getUTCMonth() + 1, salaryDay);
}
