import type { MouseEvent } from 'react';
import { isSameDay, toOrderDateKey } from '../../lib/schedule/calendar';
import {
  buildAgendaSections,
  formatAgendaDayLabel,
} from '../../lib/schedule/mobileAgenda';
import type { ScheduleEvent } from '../../types/schedule';
import styles from '../../pages/Schedule.module.css';
import MobileAgendaEventRow from './MobileAgendaEventRow';

type Props = {
  days: Date[];
  today: Date;
  events: ScheduleEvent[];
  onOpenEvent: (event: ScheduleEvent) => void;
  onContextMenu: (event: MouseEvent<HTMLElement>, scheduleEvent: ScheduleEvent) => void;
};

/**
 * スマホ週 / 今日ビュー: 日付ごとの縦アジェンダ。
 */
export default function MobileAgendaView({
  days,
  today,
  events,
  onOpenEvent,
  onContextMenu,
}: Props) {
  const sections = buildAgendaSections(events, days);

  return (
    <section className={styles.mobileAgendaView} aria-label="アジェンダ">
      {sections.map(({ day, events: dayEvents }) => {
        const isToday = isSameDay(day, today);
        return (
          <section
            key={toOrderDateKey(day)}
            className={styles.mobileAgendaSection}
            aria-label={formatAgendaDayLabel(day)}
          >
            <div className={styles.mobileDayListHeader}>
              <h2 className={isToday ? styles.mobileDayListToday : undefined}>
                {formatAgendaDayLabel(day)}
              </h2>
              <span className={styles.mobileDayListCount}>{dayEvents.length}件</span>
            </div>
            {dayEvents.length === 0 ? (
              <p className={styles.mobileDayEmpty}>予定なし</p>
            ) : (
              <ul className={styles.mobileAgendaList}>
                {dayEvents.map((event) => (
                  <li key={event.id}>
                    <MobileAgendaEventRow
                      event={event}
                      onOpen={onOpenEvent}
                      onContextMenu={onContextMenu}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </section>
  );
}
