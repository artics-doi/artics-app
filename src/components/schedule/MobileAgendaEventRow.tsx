import type { MouseEvent } from 'react';
import { SCHEDULE_CATEGORY_BY_ID } from '../../constants/schedule';
import { formatEventTime } from '../../lib/schedule/events';
import type { ScheduleEvent } from '../../types/schedule';
import styles from '../../pages/Schedule.module.css';

type Props = {
  event: ScheduleEvent;
  onOpen: (event: ScheduleEvent) => void;
  onContextMenu: (event: MouseEvent<HTMLElement>, scheduleEvent: ScheduleEvent) => void;
};

/**
 * スマホ予定表の共通行（高さ44px）。
 * 左から: カテゴリ色バー / 時刻 / タイトル / カテゴリ名。
 */
export default function MobileAgendaEventRow({ event, onOpen, onContextMenu }: Props) {
  const category = SCHEDULE_CATEGORY_BY_ID[event.categoryId] ?? SCHEDULE_CATEGORY_BY_ID.other;

  return (
    <button
      type="button"
      className={styles.mobileAgendaRow}
      onClick={() => onOpen(event)}
      onContextMenu={(contextEvent) => onContextMenu(contextEvent, event)}
    >
      <span
        className={`${styles.mobileAgendaBar} ${styles[category.tone]}`}
        aria-hidden="true"
      />
      <span className={styles.mobileAgendaTime}>{formatEventTime(event)}</span>
      <span className={styles.mobileAgendaTitle}>{event.title}</span>
      <span className={`${styles.mobileAgendaCategory} ${styles[category.tone]}`}>
        {category.label}
      </span>
    </button>
  );
}
