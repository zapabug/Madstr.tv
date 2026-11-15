import { useEffect, useState } from 'react';

// The system time shown at the left of the top bar, in the system's own hour format (24 h or 12 h)
// but without the AM / PM label.
export function formatClock(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
    .formatToParts(date)
    .filter(part => part.type !== 'dayPeriod')
    .map(part => part.value)
    .join('')
    .trim();
}

export function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  return formatClock(now);
}
