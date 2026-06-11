import { useEffect, useMemo, useState, type CSSProperties, type DragEvent, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useChatRooms } from '../hooks/useChatRooms';
import { useRoomNotificationSettings } from '../hooks/useRoomNotificationSettings';
import { useSchedules } from '../hooks/useSchedules';
import { useUsers } from '../hooks/useUsers';
import DesktopNewChatModals from '../components/desktop/DesktopNewChatModals';
import DesktopUtilityModals from '../components/desktop/DesktopUtilityModals';
import ConfirmModal from '../components/modals/ConfirmModal';
import { SCHEDULE_CATEGORIES, SCHEDULE_CATEGORY_BY_ID, SCHEDULE_NOTIFICATION_TIMINGS } from '../constants/schedule';
import type { User } from '../types';
import type { ScheduleCategoryId, ScheduleEvent, ScheduleEventInput, ScheduleNotificationTiming } from '../types/schedule';
import { getRoomAvatarLabel, getRoomAvatarUrl, getRoomDisplayName, getUnreadCount } from '../utils/room';
import {
  HOURS,
  MINUTES,
  WEEKDAYS,
  addDays,
  buildDate,
  formatMonthLabel,
  formatScheduleDateRangeLabel,
  getCalendarWeeks,
  getMonthCalendarDays,
  getWeekDays,
  isSameDay,
  isValidDate,
  startOfDay,
  toDateInputValue,
  toOrderDateKey,
} from '../lib/schedule/calendar';
import {
  buildWeekEvents,
  compareSchedules,
  copyScheduleToDate,
  eventIntersectsDay,
  formatEventTime,
  getDayMultiLaneCount,
  getSingleDayEventsForOrder,
  isMultiDayEvent,
} from '../lib/schedule/events';
import { createInitialForm, getScheduleErrorMessage, type ScheduleFormState } from '../lib/schedule/form';
import styles from './Schedule.module.css';

type ViewMode = 'today' | 'week' | 'month';
type TimePickerField = 'startTime' | 'endTime' | 'customNotifyTime';
type PendingScheduleMove = {
  eventId: string;
  title: string;
  fromLabel: string;
  toLabel: string;
  targetDate: Date;
  input: ScheduleEventInput;
};

export default function Schedule() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { chatRooms } = useChatRooms(currentUser);
  const { isRoomMuted } = useRoomNotificationSettings();
  const { users, fetchUsers } = useUsers();
  const {
    schedules,
    loading,
    error: scheduleError,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    updateScheduleOrder,
  } = useSchedules(currentUser);

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentMonth, setCurrentMonth] = useState(() => startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const today = startOfDay(new Date());
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [desktopSearchOpen, setDesktopSearchOpen] = useState(false);
  const [desktopSettingsOpen, setDesktopSettingsOpen] = useState(false);
  const [desktopNewChatOpen, setDesktopNewChatOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [activeTimePicker, setActiveTimePicker] = useState<TimePickerField | null>(null);
  const [draftTime, setDraftTime] = useState('09:00');
  const [draggingScheduleId, setDraggingScheduleId] = useState<string | null>(null);
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingScheduleMove | null>(null);
  const [copyTargetDate, setCopyTargetDate] = useState('');
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [form, setForm] = useState<ScheduleFormState>(() => createInitialForm(new Date()));

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const allUsers = useMemo<User[]>(() => {
    if (!currentUser) return users;
    const self: User = {
      uid: currentUser.uid,
      email: currentUser.email || '',
      displayName: currentUser.displayName || currentUser.email || '自分',
      photoURL: currentUser.photoURL,
      createdAt: new Date(),
    };
    return [self, ...users].sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'));
  }, [currentUser, users]);

  const visibleRooms = useMemo(
    () => chatRooms.filter((room) => room.type !== 'memo'),
    [chatRooms],
  );

  const memoRoom = useMemo(
    () => chatRooms.find((room) => room.type === 'memo'),
    [chatRooms],
  );
  const memoReturnPath = `${location.pathname}${location.search}`;

  const visibleDays = useMemo(() => {
    if (viewMode === 'today') return [startOfDay(new Date())];
    if (viewMode === 'week') return getWeekDays(selectedDate);
    return getMonthCalendarDays(currentMonth);
  }, [currentMonth, selectedDate, viewMode]);

  const visibleWeeks = useMemo(() => getCalendarWeeks(visibleDays), [visibleDays]);

  const filteredUsers = useMemo(() => {
    const keyword = userSearch.trim().toLowerCase();
    if (!keyword) return allUsers;
    return allUsers.filter((user) => (
      user.displayName.toLowerCase().includes(keyword) ||
      user.email.toLowerCase().includes(keyword)
    ));
  }, [allUsers, userSearch]);

  const selectedTargetUsers = useMemo(() => (
    allUsers.filter((user) => form.targetUserIds.includes(user.uid))
  ), [allUsers, form.targetUserIds]);

  function openCreateForm(date = selectedDate) {
    setEditingEvent(null);
    setUserSearch('');
    setForm({
      ...createInitialForm(date),
      targetUserIds: currentUser ? [currentUser.uid] : [],
    });
    setFormOpen(true);
  }

  function openEditForm(event: ScheduleEvent) {
    setEditingEvent(event);
    setUserSearch('');
    setForm(createInitialForm(event.startAt, event));
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingEvent(null);
    setSaving(false);
    setUserSearch('');
    setActiveTimePicker(null);
    setCopyDialogOpen(false);
    setCopyTargetDate('');
  }

  function openCopyDialog() {
    if (!editingEvent) return;
    setCopyTargetDate(toDateInputValue(addDays(editingEvent.startAt, 7)));
    setCopyDialogOpen(true);
  }

  function closeCopyDialog() {
    if (saving) return;
    setCopyDialogOpen(false);
    setCopyTargetDate('');
  }

  function openTimePicker(field: TimePickerField) {
    setDraftTime(form[field] || '09:00');
    setActiveTimePicker((current) => (current === field ? null : field));
  }

  function setTimeValue(field: TimePickerField, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function updateDraftTime(part: 'hour' | 'minute', value: string) {
    const [hour = '09', minute = '00'] = draftTime.split(':');
    setDraftTime(part === 'hour' ? `${value}:${minute}` : `${hour}:${value}`);
  }

  function applyTimePicker() {
    if (!activeTimePicker) return;
    setTimeValue(activeTimePicker, draftTime);
    setActiveTimePicker(null);
  }

  function cancelTimePicker() {
    setActiveTimePicker(null);
  }

  function updateTargetUsers(userId: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      targetUserIds: checked
        ? Array.from(new Set([...prev.targetUserIds, userId]))
        : prev.targetUserIds.filter((id) => id !== userId),
    }));
  }

  function selectOnlySelf() {
    if (!currentUser) return;
    setForm((prev) => ({
      ...prev,
      targetUserIds: [currentUser.uid],
    }));
  }

  function selectAllUsers() {
    setForm((prev) => ({
      ...prev,
      targetUserIds: allUsers.map((user) => user.uid),
    }));
  }

  function clearTargetUsers() {
    setForm((prev) => ({
      ...prev,
      targetUserIds: [],
    }));
  }

  function buildInputFromForm(): ScheduleEventInput {
    const targetUserIds = form.targetUserIds.length > 0
      ? form.targetUserIds
      : currentUser
        ? [currentUser.uid]
        : [];
    const selectedUsers = allUsers.filter((user) => targetUserIds.includes(user.uid));
    const startAt = buildDate(form.startDate, form.startTime, form.allDay);
    const endAt = form.endDate
      ? buildDate(form.endDate, form.endTime, form.allDay, true)
      : null;
    const customAt = form.notifyTiming === 'custom'
      ? buildDate(form.customNotifyDate, form.customNotifyTime, false)
      : null;

    return {
      title: form.title.trim(),
      categoryId: form.categoryId,
      targetUserIds,
      targetUserNames: selectedUsers.map((user) => user.displayName),
      startAt,
      endAt,
      allDay: form.allDay,
      memo: form.memo.trim(),
      notification: {
        enabled: form.notifyEnabled,
        timings: form.notifyEnabled ? [form.notifyTiming] : [],
        customAt: form.notifyEnabled ? customAt : null,
      },
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.startDate) {
      showToast('warning', '開始日を入力してください');
      return;
    }
    if (!form.allDay && !form.startTime) {
      showToast('warning', '開始時刻を入力してください');
      return;
    }
    if (form.endDate && !form.allDay && !form.endTime) {
      showToast('warning', '終了時刻を入力してください');
      return;
    }
    if (form.notifyEnabled && form.notifyTiming === 'custom' && (!form.customNotifyDate || !form.customNotifyTime)) {
      showToast('warning', '通知日と通知時刻を入力してください');
      return;
    }

    const input = buildInputFromForm();
    if (!input.title) {
      showToast('warning', 'タイトルを入力してください');
      return;
    }
    if (!isValidDate(input.startAt)) {
      showToast('warning', '開始日が正しくありません');
      return;
    }
    if (input.endAt && input.endAt < input.startAt) {
      showToast('warning', '終了日は開始日以降にしてください');
      return;
    }
    if (input.endAt && !isValidDate(input.endAt)) {
      showToast('warning', '終了日が正しくありません');
      return;
    }
    if (input.notification.customAt && !isValidDate(input.notification.customAt)) {
      showToast('warning', '通知日時が正しくありません');
      return;
    }

    setSaving(true);
    try {
      if (editingEvent) {
        await updateSchedule(editingEvent.id, input);
        showToast('success', '予定を更新しました');
      } else {
        await createSchedule(input);
        showToast('success', '予定を追加しました');
      }
      closeForm();
    } catch (error) {
      console.error('予定保存エラー:', error);
      showToast('error', getScheduleErrorMessage(error, 'save'), 8000);
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingEvent || !confirm('この予定を削除しますか？')) return;
    setSaving(true);
    try {
      await deleteSchedule(editingEvent.id);
      showToast('success', '予定を削除しました');
      closeForm();
    } catch (error) {
      console.error('予定削除エラー:', error);
      showToast('error', getScheduleErrorMessage(error, 'delete'), 8000);
      setSaving(false);
    }
  }

  async function handleCopySubmit(event: FormEvent) {
    event.preventDefault();
    if (!editingEvent) return;
    if (!copyTargetDate) {
      showToast('warning', 'コピー先の日付を選択してください');
      return;
    }

    const targetDate = buildDate(copyTargetDate, '09:00', true);
    if (!isValidDate(targetDate)) {
      showToast('warning', 'コピー先の日付が正しくありません');
      return;
    }

    setSaving(true);
    try {
      await createSchedule(copyScheduleToDate(editingEvent, targetDate));
      setSelectedDate(startOfDay(targetDate));
      setCurrentMonth(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1));
      showToast('success', '予定をコピーしました');
      closeForm();
    } catch (error) {
      console.error('予定コピーエラー:', error);
      showToast('error', getScheduleErrorMessage(error, 'save'), 8000);
      setSaving(false);
    }
  }

  async function reorderSingleDaySchedule(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const source = schedules.find((event) => event.id === sourceId);
    const target = schedules.find((event) => event.id === targetId);
    if (!source || !target || isMultiDayEvent(source) || isMultiDayEvent(target)) return;

    const dateKey = toOrderDateKey(target.startAt);
    if (toOrderDateKey(source.startAt) !== dateKey) {
      showToast('warning', '並び替えは同じ日の1日予定同士で行ってください');
      return;
    }

    const orderedEvents = getSingleDayEventsForOrder(schedules, dateKey);
    const sourceIndex = orderedEvents.findIndex((event) => event.id === sourceId);
    const targetIndex = orderedEvents.findIndex((event) => event.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const nextEvents = [...orderedEvents];
    const [movedEvent] = nextEvents.splice(sourceIndex, 1);
    nextEvents.splice(targetIndex, 0, movedEvent);

    try {
      await updateScheduleOrder(nextEvents.map((event, index) => ({
        id: event.id,
        manualOrderDate: dateKey,
        manualOrder: (index + 1) * 1000,
      })));
    } catch (error) {
      console.error('予定並び替えエラー:', error);
      showToast('error', getScheduleErrorMessage(error, 'save'), 8000);
    }
  }

  function openScheduleMoveConfirm(sourceId: string, targetDate: Date) {
    const source = schedules.find((event) => event.id === sourceId);
    if (!source) return;
    if (isSameDay(source.startAt, targetDate)) return;

    const input = copyScheduleToDate(source, targetDate);
    setPendingMove({
      eventId: source.id,
      title: source.title,
      fromLabel: formatScheduleDateRangeLabel(source.startAt, source.endAt),
      toLabel: formatScheduleDateRangeLabel(input.startAt, input.endAt),
      targetDate: startOfDay(targetDate),
      input,
    });
  }

  async function confirmScheduleMove() {
    if (!pendingMove || saving) return;
    setSaving(true);
    try {
      await updateSchedule(pendingMove.eventId, pendingMove.input);
      setSelectedDate(startOfDay(pendingMove.targetDate));
      setCurrentMonth(new Date(pendingMove.targetDate.getFullYear(), pendingMove.targetDate.getMonth(), 1));
      showToast('success', '予定を移動しました');
      setPendingMove(null);
      setSaving(false);
    } catch (error) {
      console.error('予定移動エラー:', error);
      showToast('error', getScheduleErrorMessage(error, 'save'), 8000);
      setSaving(false);
    }
  }

  function cancelScheduleMove() {
    if (saving) return;
    setPendingMove(null);
  }

  function handleScheduleDragStart(event: DragEvent<HTMLElement>, scheduleEvent: ScheduleEvent) {
    setDraggingScheduleId(scheduleEvent.id);
    setDragOverDateKey(toOrderDateKey(scheduleEvent.startAt));
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', scheduleEvent.id);
  }

  function endScheduleDrag() {
    setDraggingScheduleId(null);
    setDragOverDateKey(null);
  }

  function handleScheduleDragOver(event: DragEvent<HTMLElement>, targetDate: Date) {
    if (!draggingScheduleId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverDateKey(toOrderDateKey(targetDate));
  }

  function getWeekDropDate(event: DragEvent<HTMLElement>, weekDays: Date[]): Date {
    const rect = event.currentTarget.getBoundingClientRect();
    const columnWidth = rect.width / weekDays.length;
    const columnIndex = Math.max(0, Math.min(weekDays.length - 1, Math.floor((event.clientX - rect.left) / columnWidth)));
    return weekDays[columnIndex];
  }

  function handleWeekScheduleDragOver(event: DragEvent<HTMLElement>, weekDays: Date[]) {
    if (!draggingScheduleId) return;
    handleScheduleDragOver(event, getWeekDropDate(event, weekDays));
  }

  async function handleWeekScheduleDrop(event: DragEvent<HTMLElement>, weekDays: Date[]) {
    await handleScheduleDrop(event, getWeekDropDate(event, weekDays));
  }

  function getDropTargetScheduleId(event: DragEvent<HTMLElement>): string | null {
    const target = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>('[data-schedule-id]')
      : null;
    return target?.dataset.scheduleId ?? null;
  }

  async function handleScheduleDrop(event: DragEvent<HTMLElement>, targetDate: Date) {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = event.dataTransfer.getData('text/plain') || draggingScheduleId;
    const targetId = getDropTargetScheduleId(event);
    endScheduleDrag();
    if (!sourceId) return;
    const source = schedules.find((item) => item.id === sourceId);
    const target = targetId ? schedules.find((item) => item.id === targetId) : null;
    const targetDateKey = toOrderDateKey(targetDate);

    if (
      source &&
      target &&
      source.id !== target.id &&
      !isMultiDayEvent(source) &&
      !isMultiDayEvent(target) &&
      toOrderDateKey(source.startAt) === targetDateKey &&
      toOrderDateKey(target.startAt) === targetDateKey
    ) {
      await reorderSingleDaySchedule(sourceId, target.id);
      return;
    }

    openScheduleMoveConfirm(sourceId, targetDate);
  }

  function goPrevious() {
    if (viewMode === 'month') {
      setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    } else {
      setSelectedDate((prev) => addDays(prev, viewMode === 'week' ? -7 : -1));
    }
  }

  function goNext() {
    if (viewMode === 'month') {
      setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    } else {
      setSelectedDate((prev) => addDays(prev, viewMode === 'week' ? 7 : 1));
    }
  }

  function goToday() {
    const today = startOfDay(new Date());
    setSelectedDate(today);
    setCurrentMonth(today);
  }

  function renderTimePicker(field: TimePickerField, label: string) {
    const value = form[field];
    const [draftHour = '09', draftMinute = '00'] = draftTime.split(':');
    const open = activeTimePicker === field;

    return (
      <div className={styles.field}>
        <span>{label}</span>
        <div className={styles.timePickerRoot}>
          <button
            type="button"
            className={styles.timeTrigger}
            onClick={() => openTimePicker(field)}
            aria-expanded={open}
          >
            <strong>{value}</strong>
            <span aria-hidden="true">⌄</span>
          </button>
          {open && (
            <div className={styles.timePopover}>
              <div className={styles.timeDrums}>
                <div className={styles.timeDrum} aria-label="時">
                  {HOURS.map((hour) => (
                    <button
                      key={hour}
                      type="button"
                      className={draftHour === hour ? styles.selectedTimePart : ''}
                      onClick={() => updateDraftTime('hour', hour)}
                    >
                      {hour}
                    </button>
                  ))}
                </div>
                <span className={styles.timeSeparator}>:</span>
                <div className={styles.timeDrum} aria-label="分">
                  {MINUTES.map((minute) => (
                    <button
                      key={minute}
                      type="button"
                      className={draftMinute === minute ? styles.selectedTimePart : ''}
                      onClick={() => updateDraftTime('minute', minute)}
                    >
                      {minute}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.timePickerActions}>
                <button type="button" onClick={cancelTimePicker}>キャンセル</button>
                <button type="button" onClick={applyTimePicker}>決定</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar} aria-label="チャット一覧">
        <div className={styles.sidebarQuickActions}>
          <button type="button" onClick={() => setDesktopSearchOpen(true)}>検索</button>
          <button
            type="button"
            onClick={() => {
              if (memoRoom) {
                navigate(`/memo/${memoRoom.id}`, { state: { from: memoReturnPath } });
              }
            }}
            disabled={!memoRoom}
          >
            メモ
          </button>
          <button type="button" onClick={() => setDesktopSettingsOpen(true)}>設定</button>
        </div>
        <div className={styles.sidebarActions}>
          <button type="button" className={styles.sidebarSecondary} onClick={() => setDesktopNewChatOpen(true)}>
            ＋ 新しいチャット
          </button>
          <button type="button" className={`${styles.sidebarPrimary} ${styles.active}`} onClick={() => navigate('/schedule')}>
            行動予定表
          </button>
          <button type="button" className={styles.sidebarPrimary} onClick={() => navigate('/process')}>
            工程管理
          </button>
        </div>
        <div className={styles.roomHeader}>
          <span>ルーム</span>
          <span aria-hidden="true">⌄</span>
        </div>
        <div className={styles.roomList}>
          {visibleRooms.map((room) => {
            const unread = getUnreadCount(room, currentUser?.uid);
            const favorited = room.favorites?.includes(currentUser?.uid || '') ?? false;
            const avatarUrl = getRoomAvatarUrl(room, currentUser?.uid, users);
            return (
              <button key={room.id} type="button" className={styles.roomItem} onClick={() => navigate(`/chat/${room.id}`)}>
                <span className={styles.roomAvatar} aria-hidden="true">
                  {avatarUrl ? <img src={avatarUrl} alt="" /> : getRoomAvatarLabel(room, currentUser?.uid, users)}
                </span>
                <span className={styles.roomText}>
                  <span className={styles.roomName}>
                    {favorited && <span className={styles.favorite}>★</span>}
                    {getRoomDisplayName(room, currentUser?.uid)}
                  </span>
                  <span className={styles.roomLast}>
                    {room.lastMessage ? `${room.lastMessage.senderName}: ${room.lastMessage.text}` : 'メッセージがありません'}
                  </span>
                </span>
                {isRoomMuted(room.id) && <span className={styles.muted}>OFF</span>}
                {unread > 0 && <span className={styles.unread}>{unread}</span>}
              </button>
            );
          })}
        </div>
      </aside>

      <main className={styles.main} id="main-content">
        <header className={styles.header}>
          <div>
            <h1>{formatMonthLabel(viewMode === 'month' ? currentMonth : selectedDate)}</h1>
          </div>
          <div className={styles.headerControls}>
            <button type="button" className={styles.iconButton} onClick={goPrevious} aria-label="前へ">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button type="button" className={styles.todayButton} onClick={goToday}>今日</button>
            <button type="button" className={styles.iconButton} onClick={goNext} aria-label="次へ">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
            <div className={styles.segmented} role="tablist" aria-label="表示切替">
              {(['today', 'week', 'month'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={viewMode === mode ? styles.selected : ''}
                  onClick={() => setViewMode(mode)}
                >
                  {mode === 'today' ? '今日' : mode === 'week' ? '週' : '月'}
                </button>
              ))}
            </div>
            <button type="button" className={styles.addButton} onClick={() => openCreateForm()}>
              予定を追加
            </button>
          </div>
        </header>

        {loading ? (
          <div className={styles.loading}>行動予定を読み込み中...</div>
        ) : scheduleError ? (
          <div className={styles.errorPanel} role="alert">
            <strong>予定を取得できません</strong>
            <span>{getScheduleErrorMessage(scheduleError, 'load')}</span>
          </div>
        ) : viewMode === 'month' ? (
          <section className={styles.notionCalendar}>
            <div className={styles.notionWeekdays}>
              {WEEKDAYS.map((day) => (
                <div key={day} className={styles.weekday}>{day}</div>
              ))}
            </div>
            {visibleWeeks.map((weekDays) => {
              const weekEvents = buildWeekEvents(schedules.filter(isMultiDayEvent), weekDays);
              const laneCount = Math.max(0, ...weekEvents.map((weekEvent) => weekEvent.lane + 1));
              const singleDayEventsByDate = new Map(
                weekDays.map((day) => {
                  const dateKey = toOrderDateKey(day);
                  return [
                    dateKey,
                    schedules
                      .filter((event) => !isMultiDayEvent(event) && toOrderDateKey(event.startAt) === dateKey)
                      .sort(compareSchedules),
                  ];
                }),
              );
              const maxSingleCount = Math.max(1, ...Array.from(singleDayEventsByDate.values()).map((events) => events.length));
              return (
                <div
                  key={weekDays[0].toISOString()}
                  className={styles.notionWeek}
                  onDragOver={(dragEvent) => handleWeekScheduleDragOver(dragEvent, weekDays)}
                  onDragLeave={(dragEvent) => {
                    if (dragEvent.currentTarget.contains(dragEvent.relatedTarget as Node | null)) return;
                    setDragOverDateKey(null);
                  }}
                  onDrop={(dragEvent) => {
                    void handleWeekScheduleDrop(dragEvent, weekDays);
                  }}
                  style={{
                    '--lane-count': laneCount,
                    '--max-single-count': maxSingleCount,
                  } as CSSProperties}
                >
                  {weekDays.map((day, index) => {
                    const outsideMonth = day.getMonth() !== currentMonth.getMonth();
                    const hasHoliday = schedules.some((event) => (
                      event.categoryId === 'holiday' && eventIntersectsDay(event, day)
                    ));
                    const dayMultiLaneCount = getDayMultiLaneCount(weekEvents, index);
                    const singleDayEvents = singleDayEventsByDate.get(toOrderDateKey(day)) ?? [];
                    return (
                      <div
                        key={day.toISOString()}
                        role="button"
                        tabIndex={0}
                        className={`${styles.notionDayCell} ${outsideMonth ? styles.outsideMonth : ''} ${hasHoliday ? styles.holidayDay : ''} ${isSameDay(day, selectedDate) ? styles.selectedDay : ''} ${isSameDay(day, today) ? styles.todayDay : ''} ${dragOverDateKey === toOrderDateKey(day) ? styles.dropTargetDay : ''}`}
                        style={{
                          gridColumn: index + 1,
                          gridRow: `1 / span ${laneCount + 2}`,
                          '--day-multi-lanes': dayMultiLaneCount,
                        } as CSSProperties}
                        onClick={() => setSelectedDate(startOfDay(day))}
                        onDoubleClick={() => openCreateForm(startOfDay(day))}
                        onDragOver={(dragEvent) => handleScheduleDragOver(dragEvent, day)}
                        onDragLeave={(dragEvent) => {
                          if (dragEvent.currentTarget.contains(dragEvent.relatedTarget as Node | null)) return;
                          setDragOverDateKey(null);
                        }}
                        onDrop={(dragEvent) => {
                          void handleScheduleDrop(dragEvent, day);
                        }}
                        onKeyDown={(keyEvent) => {
                          if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                            keyEvent.preventDefault();
                            setSelectedDate(startOfDay(day));
                          }
                        }}
                      >
                        <span className={styles.dayNumber}>{day.getDate()}</span>
                        <span className={styles.singleDayEvents}>
                          {singleDayEvents.map((event) => {
                            const category = SCHEDULE_CATEGORY_BY_ID[event.categoryId] ?? SCHEDULE_CATEGORY_BY_ID.other;
                            return (
                              <button
                                key={event.id}
                                type="button"
                                draggable
                                data-schedule-id={event.id}
                                className={`${styles.notionEventBar} ${styles.singleDayEventBar} ${styles[category.tone]} ${draggingScheduleId === event.id ? styles.draggingEvent : ''}`}
                                onDragStart={(dragEvent) => handleScheduleDragStart(dragEvent, event)}
                                onDragEnd={endScheduleDrag}
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation();
                                  setSelectedDate(startOfDay(event.startAt));
                                  openEditForm(event);
                                }}
                                onDoubleClick={(doubleClickEvent) => {
                                  doubleClickEvent.stopPropagation();
                                }}
                              >
                                <strong>{event.title}</strong>
                                <small>{category.label}</small>
                                <em>{formatEventTime(event)}</em>
                              </button>
                            );
                          })}
                        </span>
                      </div>
                    );
                  })}
                  {weekEvents.map(({ event, startColumn, endColumn, lane }) => {
                    const category = SCHEDULE_CATEGORY_BY_ID[event.categoryId] ?? SCHEDULE_CATEGORY_BY_ID.other;
                    return (
                      <button
                        key={`${event.id}-${weekDays[0].toISOString()}`}
                        type="button"
                        draggable
                        data-schedule-id={event.id}
                        className={`${styles.notionEventBar} ${styles[category.tone]} ${draggingScheduleId === event.id ? styles.draggingEvent : ''}`}
                        style={{
                          gridColumn: `${startColumn} / ${endColumn + 1}`,
                          gridRow: lane + 2,
                        }}
                        onDragStart={(dragEvent) => handleScheduleDragStart(dragEvent, event)}
                        onDragEnd={endScheduleDrag}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          setSelectedDate(startOfDay(event.startAt));
                          openEditForm(event);
                        }}
                      >
                        <strong>{event.title}</strong>
                        <small>{category.label}</small>
                        <em>{formatEventTime(event)}</em>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </section>
        ) : (
          <section className={`${styles.calendar} ${styles.compactCalendar}`}>
            {visibleDays.map((day) => {
              const dayEvents = schedules
                .filter((event) => eventIntersectsDay(event, day))
                .sort(compareSchedules);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  className={`${styles.dayCell} ${isSameDay(day, selectedDate) ? styles.selectedDay : ''} ${isSameDay(day, today) ? styles.todayDay : ''} ${dragOverDateKey === toOrderDateKey(day) ? styles.dropTargetDay : ''}`}
                  onClick={() => setSelectedDate(startOfDay(day))}
                  onDoubleClick={() => openCreateForm(startOfDay(day))}
                  onDragOver={(dragEvent) => handleScheduleDragOver(dragEvent, day)}
                  onDragLeave={(dragEvent) => {
                    if (dragEvent.currentTarget.contains(dragEvent.relatedTarget as Node | null)) return;
                    setDragOverDateKey(null);
                  }}
                  onDrop={(dragEvent) => {
                    void handleScheduleDrop(dragEvent, day);
                  }}
                >
                  <span className={styles.dayNumber}>{day.getDate()}</span>
                  <span className={styles.dayEvents}>
                    {dayEvents.map((event) => {
                      const category = SCHEDULE_CATEGORY_BY_ID[event.categoryId] ?? SCHEDULE_CATEGORY_BY_ID.other;
                      return (
                        <span
                          key={event.id}
                          draggable
                          data-schedule-id={event.id}
                          className={`${styles.eventChip} ${styles[category.tone]} ${draggingScheduleId === event.id ? styles.draggingEvent : ''}`}
                          onDragStart={(dragEvent) => handleScheduleDragStart(dragEvent, event)}
                          onDragEnd={endScheduleDrag}
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            openEditForm(event);
                          }}
                          onDoubleClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                          }}
                        >
                          <strong>{event.title}</strong>
                          <small>{category.label}</small>
                          {!event.allDay && <em>{formatEventTime(event)}</em>}
                        </span>
                      );
                    })}
                  </span>
                </button>
              );
            })}
          </section>
        )}
      </main>

      {formOpen && (
        <div className={styles.modalOverlay} onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeForm();
        }}>
          <form className={styles.modal} onSubmit={handleSubmit}>
            <div className={styles.modalHeader}>
              <h2>{editingEvent ? '予定を編集' : '予定を追加'}</h2>
              <button type="button" onClick={closeForm} aria-label="閉じる">×</button>
            </div>

            <label className={styles.field}>
              <span>タイトル</span>
              <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
            </label>

            <label className={styles.field}>
              <span>カテゴリ</span>
              <select value={form.categoryId} onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value as ScheduleCategoryId }))}>
                {SCHEDULE_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>{category.label}</option>
                ))}
              </select>
            </label>

            <div className={styles.field}>
              <div className={styles.fieldHeader}>
                <span>対象ユーザー</span>
                <em>{form.targetUserIds.length || 1}人選択中</em>
              </div>
              <div className={styles.selectedUsers}>
                {selectedTargetUsers.length > 0 ? selectedTargetUsers.map((user) => (
                  <button
                    key={user.uid}
                    type="button"
                    onClick={() => updateTargetUsers(user.uid, false)}
                    aria-label={`${user.displayName}を解除`}
                  >
                    <span>{user.displayName}</span>
                    <strong aria-hidden="true">×</strong>
                  </button>
                )) : (
                  <span>未選択の場合は自分だけになります</span>
                )}
              </div>
              <div className={styles.userPickerToolbar}>
                <input
                  type="search"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="名前で検索"
                  aria-label="対象ユーザーを検索"
                />
                <div className={styles.userPickerActions}>
                  <button type="button" onClick={selectOnlySelf}>自分</button>
                  <button type="button" onClick={selectAllUsers}>全員</button>
                  <button type="button" onClick={clearTargetUsers}>解除</button>
                </div>
              </div>
              <div className={styles.userChecks}>
                {filteredUsers.map((user) => {
                  const checked = form.targetUserIds.includes(user.uid);
                  return (
                    <button
                      key={user.uid}
                      type="button"
                      className={checked ? styles.userChecked : ''}
                      onClick={() => updateTargetUsers(user.uid, !checked)}
                      aria-pressed={checked}
                    >
                      <span className={styles.userName}>{user.displayName}</span>
                    </button>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <p className={styles.noUsers}>該当するユーザーはいません。</p>
                )}
              </div>
            </div>

            <label className={styles.inlineCheck}>
              <input type="checkbox" checked={form.allDay} onChange={(event) => setForm((prev) => ({ ...prev, allDay: event.target.checked }))} />
              終日
            </label>

            <div className={styles.dateGrid}>
              <label className={styles.field}>
                <span>開始日</span>
                <input type="date" value={form.startDate} onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))} />
              </label>
              <label className={styles.field}>
                <span>終了日</span>
                <input type="date" value={form.endDate} onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))} />
              </label>
            </div>

            {!form.allDay && (
              <div className={styles.dateGrid}>
                {renderTimePicker('startTime', '開始時刻')}
                {renderTimePicker('endTime', '終了時刻')}
              </div>
            )}

            <label className={styles.field}>
              <span>メモ</span>
              <textarea value={form.memo} onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))} rows={3} />
            </label>

            <label className={styles.inlineCheck}>
              <input type="checkbox" checked={form.notifyEnabled} onChange={(event) => setForm((prev) => ({ ...prev, notifyEnabled: event.target.checked }))} />
              通知する
            </label>
            {form.notifyEnabled && (
              <div className={styles.dateGrid}>
                <label className={styles.field}>
                  <span>通知タイミング</span>
                  <select value={form.notifyTiming} onChange={(event) => setForm((prev) => ({ ...prev, notifyTiming: event.target.value as ScheduleNotificationTiming }))}>
                    {SCHEDULE_NOTIFICATION_TIMINGS.map((timing) => (
                      <option key={timing.id} value={timing.id}>{timing.label}</option>
                    ))}
                  </select>
                </label>
                {form.notifyTiming === 'custom' && (
                  <>
                    <label className={styles.field}>
                      <span>通知日</span>
                      <input type="date" value={form.customNotifyDate} onChange={(event) => setForm((prev) => ({ ...prev, customNotifyDate: event.target.value }))} />
                    </label>
                    {renderTimePicker('customNotifyTime', '通知時刻')}
                  </>
                )}
              </div>
            )}

            <div className={styles.modalActions}>
              <div className={styles.modalLeftActions}>
                {editingEvent && (
                  <>
                    <button type="button" className={styles.deleteButton} onClick={handleDelete} disabled={saving}>
                      削除
                    </button>
                    <button type="button" className={styles.copyButton} onClick={openCopyDialog} disabled={saving}>
                      コピー
                    </button>
                  </>
                )}
              </div>
              <div className={styles.modalRightActions}>
                <button type="button" className={styles.cancelButton} onClick={closeForm} disabled={saving}>
                  キャンセル
                </button>
                <button type="submit" className={styles.saveButton} disabled={saving}>
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {copyDialogOpen && editingEvent && (
        <div className={styles.modalOverlay} onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeCopyDialog();
        }}>
          <form className={`${styles.modal} ${styles.copyModal}`} onSubmit={handleCopySubmit}>
            <div className={styles.modalHeader}>
              <h2>予定をコピー</h2>
              <button type="button" onClick={closeCopyDialog} aria-label="閉じる" disabled={saving}>×</button>
            </div>
            <div className={styles.copySummary}>
              <strong>{editingEvent.title}</strong>
              <span>{toDateInputValue(editingEvent.startAt)} からコピーします</span>
            </div>
            <label className={styles.field}>
              <span>コピー先の日付</span>
              <input
                type="date"
                value={copyTargetDate}
                onChange={(event) => setCopyTargetDate(event.target.value)}
              />
            </label>
            <p className={styles.copyHint}>
              複数日予定は同じ日数のままコピーします。時刻と通知設定もコピー先の日付に合わせて引き継がれます。
            </p>
            <div className={styles.modalActions}>
              <div className={styles.modalLeftActions} />
              <div className={styles.modalRightActions}>
                <button type="button" className={styles.cancelButton} onClick={closeCopyDialog} disabled={saving}>
                  キャンセル
                </button>
                <button type="submit" className={styles.saveButton} disabled={saving}>
                  {saving ? 'コピー中...' : 'コピー'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {pendingMove && (
        <ConfirmModal
          title="予定を移動しますか？"
          message={`「${pendingMove.title}」を ${pendingMove.fromLabel} から ${pendingMove.toLabel} へ移動します。`}
          confirmText={saving ? '移動中...' : '移動する'}
          cancelText="キャンセル"
          onConfirm={() => {
            void confirmScheduleMove();
          }}
          onCancel={cancelScheduleMove}
        />
      )}

      <DesktopUtilityModals
        currentUser={currentUser}
        chatRooms={chatRooms}
        searchOpen={desktopSearchOpen}
        settingsOpen={desktopSettingsOpen}
        onCloseSearch={() => setDesktopSearchOpen(false)}
        onCloseSettings={() => setDesktopSettingsOpen(false)}
      />
      <DesktopNewChatModals
        currentUser={currentUser}
        chatRooms={chatRooms}
        isOpen={desktopNewChatOpen}
        onClose={() => setDesktopNewChatOpen(false)}
      />
    </div>
  );
}
