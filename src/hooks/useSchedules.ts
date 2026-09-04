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
  where,
  writeBatch,
  type QueryConstraint,
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
    recipientScope?: ScheduleNotificationSetting['recipientScope'];
    timings?: ScheduleNotificationSetting['timings'];
    customAt?: Timestamp | null;
  };
};

function timestampToDate(value: Timestamp | null | undefined): Date | null {
  return value ? value.toDate() : null;
}

function serializeNotification(notification: ScheduleNotificationSetting) {
  const timing = notification.timings[0];
  return {
    enabled: notification.enabled,
    recipientScope: notification.recipientScope ?? 'targets',
    timings: notification.enabled ? notification.timings : [],
    customAt: notification.enabled && timing === 'atStart'
      ? serverTimestamp()
      : notification.enabled && notification.customAt
        ? notification.customAt
        : null,
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
      recipientScope: data.notification?.recipientScope ?? 'targets',
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

export interface UseSchedulesOptions {
  subscribe?: boolean;
  startAt?: Date;
  endAt?: Date;
  notificationEnabled?: boolean;
  orderByStartAt?: boolean;
}

type ScheduleSnapshotState = {
  key: string | null;
  schedules: ScheduleEvent[];
  error: Error | null;
};

export function useSchedules(
  currentUser: FirebaseUser | null,
  options: UseSchedulesOptions = {},
) {
  const {
    subscribe = true,
    startAt,
    endAt,
    notificationEnabled,
    orderByStartAt = true,
  } = options;
  const startAtMs = startAt?.getTime() ?? null;
  const endAtMs = endAt?.getTime() ?? null;
  const currentUserId = currentUser?.uid ?? null;
  const queryKey = currentUserId && subscribe
    ? [currentUserId, startAtMs ?? 'all', endAtMs ?? 'all', notificationEnabled ?? 'all', orderByStartAt].join(':')
    : null;
  const [snapshotState, setSnapshotState] = useState<ScheduleSnapshotState>({
    key: null,
    schedules: [],
    error: null,
  });

  useEffect(() => {
    if (!currentUserId || !subscribe || !queryKey) return;

    const constraints: QueryConstraint[] = [];
    if (notificationEnabled !== undefined) {
      constraints.push(where('notification.enabled', '==', notificationEnabled));
    }
    if (startAtMs !== null) constraints.push(where('startAt', '>=', new Date(startAtMs)));
    if (endAtMs !== null) constraints.push(where('startAt', '<', new Date(endAtMs)));
    if (orderByStartAt) constraints.push(orderBy('startAt', 'asc'));

    const q = query(collection(db, 'schedules'), ...constraints);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const schedules = snapshot.docs
          .map((item) => toScheduleEvent(item.id, item.data() as FirestoreSchedule))
          .sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
        setSnapshotState({ key: queryKey, schedules, error: null });
      },
      (error) => {
        console.error('行動予定表の取得エラー:', error);
        setSnapshotState({ key: queryKey, schedules: [], error });
      },
    );

    return () => unsubscribe();
  }, [currentUserId, endAtMs, notificationEnabled, orderByStartAt, queryKey, startAtMs, subscribe]);

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
    schedules: queryKey && snapshotState.key === queryKey ? snapshotState.schedules : [],
    loading: Boolean(queryKey && snapshotState.key !== queryKey),
    error: queryKey && snapshotState.key === queryKey ? snapshotState.error : null,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    updateScheduleOrder,
  };
}
