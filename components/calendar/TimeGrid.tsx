'use client';

// Week/Day time grid: a fixed time axis on the left and one column per day.
// Interviews are absolutely positioned by their COMPANY_TZ local start/end.

import type { CalendarInterview } from '@/lib/hiring/scheduling/types';
import EventBlock from './EventBlock';
import { DAY_END_MIN, DAY_START_MIN, dayLabel, fmtTime, localParts, todayYmd } from './util';

const HOUR_PX = 52;
const SPAN_MIN = DAY_END_MIN - DAY_START_MIN;
const GRID_PX = (SPAN_MIN / 60) * HOUR_PX;

export default function TimeGrid({
  days,
  interviews,
  onOpen
}: {
  days: string[];
  interviews: CalendarInterview[];
  onOpen: (iv: CalendarInterview) => void;
}) {
  const hours: number[] = [];
  for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += 60) hours.push(m);
  const today = todayYmd();

  // Bucket interviews (with a concrete start) by their local day.
  const byDay: Record<string, CalendarInterview[]> = {};
  for (const iv of interviews) {
    if (!iv.startsAt) continue;
    const { ymd } = localParts(new Date(iv.startsAt).toISOString());
    (byDay[ymd] ??= []).push(iv);
  }

  return (
    <div className="cal-grid" style={{ height: GRID_PX + 28 }}>
      <div className="cal-axis" style={{ paddingTop: 28 }}>
        {hours.map((m) => (
          <div key={m} className="cal-hour" style={{ height: HOUR_PX }}>
            <span>{fmtTime(m)}</span>
          </div>
        ))}
      </div>
      <div className="cal-days" style={{ ['--cols' as string]: days.length }}>
        {days.map((ymd) => (
          <div key={ymd} className={`cal-day${ymd === today ? ' is-today' : ''}`}>
            <div className="cal-day-head">{dayLabel(ymd)}</div>
            <div className="cal-day-body" style={{ height: GRID_PX }}>
              {hours.map((m) => (
                <div key={m} className="cal-slotline" style={{ height: HOUR_PX }} />
              ))}
              {(byDay[ymd] ?? []).map((iv) => {
                const start = localParts(new Date(iv.startsAt!).toISOString()).minutes;
                const end = iv.endsAt
                  ? localParts(new Date(iv.endsAt).toISOString()).minutes
                  : start + iv.durationMin;
                const top = ((start - DAY_START_MIN) / 60) * HOUR_PX;
                const height = Math.max(18, ((end - start) / 60) * HOUR_PX - 2);
                return (
                  <EventBlock
                    key={iv.id}
                    interview={iv}
                    onOpen={onOpen}
                    style={{ position: 'absolute', top, height, left: 4, right: 4 }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
