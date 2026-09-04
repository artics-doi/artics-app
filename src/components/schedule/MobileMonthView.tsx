import type { MouseEvent } from 'react';
import {
  WEEKDAYS,
  isSameDay,
  startOfDay,
  toOrderDateKey,
} from '../../lib/schedule/calendar';
import {
  buildAgendaSections,
  buildMonthDayDots,
  formatAgendaDayLabel,
} from '../../lib/schedule/mobileAgenda';
import type { ScheduleEvent } from '../../types/schedule';
import styles from '../../pages/Schedule.module.css';
import MobileAgendaEventRow from './MobileAgendaEventRow';

type Props = {
  monthDays: Date[];
  currentMonth: Date;
  selectedDate: Date;
  today: Date;
  events: ScheduleEvent[];
  onSelectDate: (day: Date) => void;
  onOpenEvent: (event: ScheduleEvent) => void;
  onContextMenu: (event: MouseEvent<HTMLElement>, scheduleEvent: ScheduleEvent) => void;
};

/**
 * スマホ月ビュー: ドットカレンダー + 選択日の予定リスト。
 */
export default function MobileMonthView({
  monthDays,
  currentMonth,
  selectedDate,
  today,
  events,
  onSelectDate,
  onOpenEvent,
  onContextMenu,
}: Props) {
  const selectedSection = buildAgendaSections(events, [selectedDate])[0];
  const selectedEvents = selectedSection?.events ?? [];

  return (
    <section className={styles.mobileMonthView} aria-label="月ビュー">
      <div className={styles.mobileDotWeekdays}>
        {WEEKDAYS.map((day) => (
          <div key={day} className={styles.mobileDotWeekday}>{day}</div>
        ))}
      </div>
      <div className={styles.mobileDotGrid}>
        {monthDays.map((day) => {
          const outsideMonth = day.getMonth() !== currentMonth.getMonth();
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, today);
          const { tones, overflow } = buildMonthDayDots(events, day);
          return (
            <button
              key={toOrderDateKey(day)}
              type="button"
              className={[
                styles.mobileDotCell,
                outsideMonth ? styles.mobileDotOutside : '',
                isSelected ? styles.mobileDotSelected : '',
                isToday ? styles.mobileDotToday : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelectDate(startOfDay(day))}
              aria-label={`${formatAgendaDayLabel(day)}${isSelected ? '（選択中）' : ''}`}
              aria-pressed={isSelected}
            >
              <span className={styles.mobileDotDayNumber}>{day.getDate()}</span>
              <span className={styles.mobileDotRow} aria-hidden="true">
                {tones.map((tone, index) => (
                  <span
                    key={`${toOrderDateKey(day)}-${tone}-${index}`}
                    className={`${styles.mobileDot} ${styles[tone]}`}
                  />
                ))}
                {overflow > 0 && (
                  <span className={styles.mobileDotOverflow}>+{overflow}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.mobileDayList}>
        <div className={styles.mobileDayListHeader}>
          <h2 className={isSameDay(selectedDate, today) ? styles.mobileDayListToday : undefined}>
            {formatAgendaDayLabel(selectedDate)}
          </h2>
          <span className={styles.mobileDayListCount}>{selectedEvents.length}件</span>
        </div>
        {selectedEvents.length === 0 ? (
          <p className={styles.mobileDayEmpty}>予定なし</p>
        ) : (
          <ul className={styles.mobileAgendaList}>
            {selectedEvents.map((event) => (
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
      </div>
    </section>
  );
}
