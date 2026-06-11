import { useCallback, useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ScheduleEvent, ScheduleEventInput, ScheduleNotificationSetting } from '../types/schedule';

type FirestoreSchedule = Omit<ScheduleEvent, 'id' | 'startAt' | 'endAt' | 'createdAt' | 'updatedAt' | 'notification'> & {
  startAt?: Timestamp;
  endAt?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  notification?: {
    enabled?: boolean;
    timings?: ScheduleNotificationSetting['timings'];
    customAt?: Timestamp | null;
  };
};

function timestampToDate(value: Timestamp | null | undefined): Date | null {
  return value ? value.toDate() : null;
}

function serializeNotification(notification: ScheduleNotificationSetting) {
  return {
    enabled: notification.enabled,
    timings: notification.enabled ? notification.timings : [],
    customAt: notification.enabled && notification.customAt ? notification.customAt : null,
  };
}

function toScheduleEvent(id: string, data: FirestoreSchedule): ScheduleEvent {
  return {
    id,
    title: data.title || '',
    categoryId: data.categoryId || 'other',
    targetUserIds: data.targetUserIds || [],
    targetUserNames: data.targetUserNames || [],
    startAt: timestampToDate(data.startAt) ?? new Date(),
    endAt: timestampToDate(data.endAt),
    allDay: data.allDay ?? true,
    memo: data.memo || '',
    notification: {
      enabled: data.notification?.enabled ?? false,
      timings: data.notification?.timings || [],
      customAt: timestampToDate(data.notification?.customAt),
    },
    createdBy: data.createdBy || '',
    createdByName: data.createdByName || '',
    createdAt: timestampToDate(data.createdAt),
    updatedAt: timestampToDate(data.updatedAt),
    manualOrderDate: data.manualOrderDate ?? null,
    manualOrder: typeof data.manualOrder === 'number' ? data.manualOrder : null,
    sentNotificationKeys: Array.isArray(data.sentNotificationKeys) ? data.sentNotificationKeys : [],
  };
}

export function useSchedules(currentUser: FirebaseUser | null) {
  const [schedules, setSchedules] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const q = query(collection(db, 'schedules'), orderBy('startAt', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setSchedules(snapshot.docs.map((item) => toScheduleEvent(item.id, item.data() as FirestoreSchedule)));
        setLoading(false);
        setError(null);
      },
      (error) => {
        console.error('行動予定表の取得エラー:', error);
        setError(error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUser]);

  const createSchedule = useCallback(async (input: ScheduleEventInput) => {
    if (!currentUser) throw new Error('ログインが必要です');
    console.info('[Schedule] createSchedule', {
      title: input.title,
      categoryId: input.categoryId,
      startAt: input.startAt.toISOString(),
      endAt: input.endAt?.toISOString() ?? null,
      allDay: input.allDay,
      targetUserCount: input.targetUserIds.length,
      notification: {
        ...input.notification,
        customAt: input.notification.customAt?.toISOString() ?? null,
      },
    });
    await addDoc(collection(db, 'schedules'), {
      ...input,
      notification: serializeNotification(input.notification),
      createdBy: currentUser.uid,
      createdByName: currentUser.displayName || currentUser.email || 'Unknown',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }, [currentUser]);

  const updateSchedule = useCallback(async (scheduleId: string, input: ScheduleEventInput) => {
    if (!currentUser) throw new Error('ログインが必要です');
    console.info('[Schedule] updateSchedule', {
      scheduleId,
      title: input.title,
      categoryId: input.categoryId,
      startAt: input.startAt.toISOString(),
      endAt: input.endAt?.toISOString() ?? null,
      allDay: input.allDay,
      targetUserCount: input.targetUserIds.length,
      notification: {
        ...input.notification,
        customAt: input.notification.customAt?.toISOString() ?? null,
      },
    });
    await updateDoc(doc(db, 'schedules', scheduleId), {
      ...input,
      notification: serializeNotification(input.notification),
      updatedAt: serverTimestamp(),
    });
  }, [currentUser]);

  const deleteSchedule = useCallback(async (scheduleId: string) => {
    if (!currentUser) throw new Error('ログインが必要です');
    console.info('[Schedule] deleteSchedule', { scheduleId });
    await deleteDoc(doc(db, 'schedules', scheduleId));
  }, [currentUser]);

  const updateScheduleOrder = useCallback(async (orders: Array<{ id: string; manualOrderDate: string; manualOrder: number }>) => {
    if (!currentUser) throw new Error('ログインが必要です');
    const batch = writeBatch(db);
    orders.forEach((order) => {
      batch.update(doc(db, 'schedules', order.id), {
        manualOrderDate: order.manualOrderDate,
        manualOrder: order.manualOrder,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }, [currentUser]);

  return {
    schedules: currentUser ? schedules : [],
    loading: currentUser ? loading : false,
    error: currentUser ? error : null,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    updateScheduleOrder,
  };
}
