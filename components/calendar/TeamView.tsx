'use client';

// "Who is interviewing which day": rows = interviewers, columns = the week's
// business days, each cell lists that person's interviews that day.

import type { CalendarInterview } from '@/lib/hiring/scheduling/types';
import EventBlock from './EventBlock';
import { dayLabel, founderColor, founderName, localParts, todayYmd } from './util';

export default function TeamView({
  days,
  interviews,
  interviewerIds,
  onOpen
}: {
  days: string[];
  interviews: CalendarInterview[];
  interviewerIds: string[];
  onOpen: (iv: CalendarInterview) => void;
}) {
  const today = todayYmd();
  // Show interviewer rows, plus anyone who still has interviews on the board
  // (e.g. someone recently turned off but with existing bookings).
  const rowIds = [
    ...interviewerIds,
    ...interviews
      .flatMap((iv) => iv.panel.map((p) => p.founderId))
      .filter((id) => !interviewerIds.includes(id))
  ].filter((id, i, a) => a.indexOf(id) === i);
  // Index interviews by "founderId|ymd".
  const cells: Record<string, CalendarInterview[]> = {};
  for (const iv of interviews) {
    if (!iv.startsAt) continue;
    const { ymd } = localParts(new Date(iv.startsAt).toISOString());
    for (const m of iv.panel) (cells[`${m.founderId}|${ymd}`] ??= []).push(iv);
  }

  return (
    <div className="team-view">
      <table className="team-table">
        <thead>
          <tr>
            <th className="team-corner">Interviewer</th>
            {days.map((ymd) => (
              <th key={ymd} className={ymd === today ? 'is-today' : ''}>
                {dayLabel(ymd)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowIds.map((fid) => (
            <tr key={fid}>
              <th className="team-row-head">
                <span
                  className="team-dot"
                  style={{ background: founderColor(fid) }}
                />
                {founderName(fid)}
              </th>
              {days.map((ymd) => {
                const list = cells[`${fid}|${ymd}`] ?? [];
                return (
                  <td key={ymd} className="team-cell">
                    {list.length === 0 ? (
                      <span className="team-empty">—</span>
                    ) : (
                      list.map((iv) => (
                        <EventBlock
                          key={iv.id}
                          interview={iv}
                          compact
                          onOpen={onOpen}
                        />
                      ))
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
