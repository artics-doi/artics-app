import { useEffect, useRef } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { useSchedules } from './useSchedules';
import { useElectronNotification } from './useElectronNotification';
import {
  formatScheduleNotificationBody,
  getScheduleNotificationKey,
  getScheduleNotificationTime,
  SCHEDULE_NOTIFICATION_GRACE_MS,
} from '../utils/scheduleNotifications';

const LOCAL_SENT_KEY = 'artics-schedule-notification-sent-keys';

function readSentKeys(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_SENT_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeSentKeys(keys: Set<string>) {
  localStorage.setItem(LOCAL_SENT_KEY, JSON.stringify(Array.from(keys).slice(-500)));
}

export function useScheduleNotifications(currentUser: FirebaseUser | null) {
  const { schedules } = useSchedules(currentUser);
  const { showNotification } = useElectronNotification();
  const sentKeysRef = useRef<Set<string>>(readSentKeys());

  useEffect(() => {
    if (!currentUser) return;

    const checkDueSchedules = async () => {
      const now = Date.now();

      schedules.forEach((schedule) => {
        if (!schedule.notification.enabled) return;
        const targetUserIds = schedule.targetUserIds.length > 0 ? schedule.targetUserIds : [schedule.createdBy];
        if (!targetUserIds.includes(currentUser.uid)) return;

        schedule.notification.timings.forEach((timing) => {
          const notifyAt = getScheduleNotificationTime(schedule, timing);
          if (!notifyAt) return;

          const notifyAtMs = notifyAt.getTime();
          if (notifyAtMs > now || notifyAtMs < now - SCHEDULE_NOTIFICATION_GRACE_MS) return;

          const key = getScheduleNotificationKey(schedule, timing, notifyAt);
          if (sentKeysRef.current.has(key)) return;

          void (async () => {
            const shown = await showNotification('予定通知', formatScheduleNotificationBody(schedule), key, undefined, 'schedule');
            if (shown) {
              sentKeysRef.current.add(key);
              writeSentKeys(sentKeysRef.current);
            }
          })();
        });
      });
    };

    void checkDueSchedules();
    const intervalId = window.setInterval(() => {
      void checkDueSchedules();
    }, 30 * 1000);
    return () => window.clearInterval(intervalId);
  }, [currentUser, schedules, showNotification]);
}
