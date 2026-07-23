export type BusinessWorkingPeriod = {
  open: string;
  close: string;
};

export type BusinessWorkingDay = {
  closed: boolean;
  mode: 'continuous' | 'split';
  periods: BusinessWorkingPeriod[];
  // Legacy compatibility fields kept while older clients still read them.
  open: string;
  close: string;
};

export type BusinessWorkingHours = Record<string, BusinessWorkingDay>;

export const BUSINESS_DAYS = [
  ['saturday', 'السبت'],
  ['sunday', 'الأحد'],
  ['monday', 'الاثنين'],
  ['tuesday', 'الثلاثاء'],
  ['wednesday', 'الأربعاء'],
  ['thursday', 'الخميس'],
  ['friday', 'الجمعة']
] as const;

const DEFAULT_PERIOD: BusinessWorkingPeriod = { open: '08:00', close: '22:00' };
const DEFAULT_SPLIT_PERIODS: BusinessWorkingPeriod[] = [
  { open: '08:00', close: '12:00' },
  { open: '16:00', close: '22:00' }
];

function validTime(value: unknown, fallback: string): string {
  const text = String(value || '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback;
}

function normalizePeriod(value: unknown, fallback: BusinessWorkingPeriod): BusinessWorkingPeriod {
  const raw = value && typeof value === 'object' ? value as Partial<BusinessWorkingPeriod> : {};
  return {
    open: validTime(raw.open, fallback.open),
    close: validTime(raw.close, fallback.close)
  };
}

export function defaultBusinessWorkingHours(): BusinessWorkingHours {
  return Object.fromEntries(BUSINESS_DAYS.map(([key]) => [key, {
    closed: false,
    mode: 'continuous' as const,
    periods: [{ ...DEFAULT_PERIOD }],
    open: DEFAULT_PERIOD.open,
    close: DEFAULT_PERIOD.close
  }]));
}

export function normalizeBusinessWorkingHours(value: unknown): BusinessWorkingHours {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const defaults = defaultBusinessWorkingHours();
  return Object.fromEntries(BUSINESS_DAYS.map(([key]) => {
    const raw = source[key] && typeof source[key] === 'object'
      ? source[key] as Record<string, unknown>
      : {};
    const legacy = normalizePeriod(raw, DEFAULT_PERIOD);
    const requestedMode = raw.mode === 'split' ? 'split' : 'continuous';
    const rawPeriods = Array.isArray(raw.periods) ? raw.periods : [];
    const periods = requestedMode === 'split'
      ? [
          normalizePeriod(rawPeriods[0], DEFAULT_SPLIT_PERIODS[0]),
          normalizePeriod(rawPeriods[1], DEFAULT_SPLIT_PERIODS[1])
        ]
      : [normalizePeriod(rawPeriods[0], legacy)];
    const first = periods[0] || defaults[key].periods[0];
    const last = periods[periods.length - 1] || first;
    return [key, {
      closed: Boolean(raw.closed),
      mode: requestedMode,
      periods,
      open: first.open,
      close: last.close
    } satisfies BusinessWorkingDay];
  }));
}

export function updateWorkingDay(
  hours: BusinessWorkingHours,
  dayKey: string,
  updater: (day: BusinessWorkingDay) => BusinessWorkingDay
): BusinessWorkingHours {
  const normalized = normalizeBusinessWorkingHours(hours);
  const nextDay = updater(normalized[dayKey]);
  const periods = nextDay.mode === 'split'
    ? nextDay.periods.slice(0, 2)
    : nextDay.periods.slice(0, 1);
  const first = periods[0] || DEFAULT_PERIOD;
  const last = periods[periods.length - 1] || first;
  return {
    ...normalized,
    [dayKey]: {
      ...nextDay,
      periods,
      open: first.open,
      close: last.close
    }
  };
}

export function setWorkingDayMode(
  hours: BusinessWorkingHours,
  dayKey: string,
  mode: BusinessWorkingDay['mode']
): BusinessWorkingHours {
  return updateWorkingDay(hours, dayKey, day => ({
    ...day,
    mode,
    periods: mode === 'split'
      ? [
          normalizePeriod(day.periods[0], DEFAULT_SPLIT_PERIODS[0]),
          normalizePeriod(day.periods[1], DEFAULT_SPLIT_PERIODS[1])
        ]
      : [normalizePeriod(day.periods[0], DEFAULT_PERIOD)]
  }));
}

export function setWorkingPeriod(
  hours: BusinessWorkingHours,
  dayKey: string,
  periodIndex: number,
  field: keyof BusinessWorkingPeriod,
  value: string
): BusinessWorkingHours {
  return updateWorkingDay(hours, dayKey, day => {
    const periods = [...day.periods];
    const fallback = periodIndex === 1 ? DEFAULT_SPLIT_PERIODS[1] : DEFAULT_SPLIT_PERIODS[0];
    periods[periodIndex] = {
      ...normalizePeriod(periods[periodIndex], fallback),
      [field]: validTime(value, periods[periodIndex]?.[field] || fallback[field])
    };
    return { ...day, periods };
  });
}

export function copyWorkingDayToAll(hours: BusinessWorkingHours, sourceKey: string): BusinessWorkingHours {
  const normalized = normalizeBusinessWorkingHours(hours);
  const source = normalized[sourceKey];
  return Object.fromEntries(BUSINESS_DAYS.map(([key]) => [key, {
    ...source,
    periods: source.periods.map(period => ({ ...period }))
  }]));
}

function minutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function periodContains(period: BusinessWorkingPeriod, currentMinutes: number): boolean {
  const start = minutes(period.open);
  const end = minutes(period.close);
  return end < start
    ? currentMinutes >= start || currentMinutes <= end
    : currentMinutes >= start && currentMinutes <= end;
}

export function getBusinessOpenStatus(
  value: unknown,
  now = new Date()
): { open: boolean; label: string; periodsLabel: string } {
  const hours = normalizeBusinessWorkingHours(value);
  const dayKey = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
  const day = hours[dayKey];
  if (!day || day.closed) return { open: false, label: 'مغلق اليوم', periodsLabel: 'مغلق' };
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const activePeriod = day.periods.find(period => periodContains(period, currentMinutes));
  const periodsLabel = day.periods.map(period => `${period.open} – ${period.close}`).join(' · ');
  if (activePeriod) return { open: true, label: `مفتوح الآن · حتى ${activePeriod.close}`, periodsLabel };
  const nextPeriod = day.periods.find(period => minutes(period.open) > currentMinutes);
  return {
    open: false,
    label: nextPeriod ? `مغلق الآن · يفتح ${nextPeriod.open}` : 'مغلق الآن',
    periodsLabel
  };
}

export function workingDaySummary(day: BusinessWorkingDay): string {
  if (day.closed) return 'مغلق';
  return day.periods.map(period => `${period.open} – ${period.close}`).join(' · ');
}
