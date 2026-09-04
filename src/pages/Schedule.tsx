import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type MouseEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useChatRooms } from '../hooks/useChatRooms';
import { useIsNarrowViewport } from '../hooks/useIsNarrowViewport';
import { useRoomNotificationSettings } from '../hooks/useRoomNotificationSettings';
import { useSchedules } from '../hooks/useSchedules';
import { useUsers } from '../hooks/useUsers';
import { isElectronEnv } from '../hooks/useElectronNotification';
import { useDesktopRoomPaneResize } from '../hooks/useDesktopRoomPaneResize';
import DesktopNewChatModals from '../components/desktop/DesktopNewChatModals';
import DesktopUtilityModals from '../components/desktop/DesktopUtilityModals';
import ConfirmModal from '../components/modals/ConfirmModal';
import { MobileAgendaView, MobileMonthView } from '../components/schedule';
import { SCHEDULE_CATEGORIES, SCHEDULE_CATEGORY_BY_ID, SCHEDULE_NOTIFICATION_TIMINGS } from '../constants/schedule';
import type { User } from '../types';
import type { ScheduleCategoryId, ScheduleEvent, ScheduleEventInput, ScheduleNotificationTiming } from '../types/schedule';
import { getRoomAvatarLabel, getRoomAvatarUrl, getRoomDisplayName, getUnreadCount } from '../utils/room';
import { formatScheduleNotificationDateTime, resolveScheduleNotificationCustomAt } from '../utils/scheduleNotifications';
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
  formatEventTargetsTitle,
  formatEventTime,
  getEventTargetPreview,
  getDayMultiLaneCount,
  getSingleDayEventsForOrder,
  isMultiDayEvent,
} from '../lib/schedule/events';
import {
  filterSchedulesByCategories,
} from '../lib/schedule/filters';
import { createInitialForm, getScheduleErrorMessage, type ScheduleFormState } from '../lib/schedule/form';
import {
  ELECTRON_COMPACT_MAX_WIDTH,
  getAppEntryPath,
  shouldReturnScheduleToChatList,
} from '../utils/navigation';
import Chat from './Chat';
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
type ScheduleContextMenu = {
  event: ScheduleEvent;
  x: number;
  y: number;
};
type ScheduleNavigationState = {
  allowNarrowSchedule?: boolean;
};

const SCHEDULE_OVERLAP_LOOKBACK_DAYS = 31;

function EventParticipants({ targetUserNames }: { targetUserNames: string[] }) {
  const { visibleNames, remainingCount } = getEventTargetPreview(targetUserNames);
  if (visibleNames.length === 0) return null;

  const title = formatEventTargetsTitle(targetUserNames);
  return (
    <span className={styles.eventParticipants} title={title} aria-label={title}>
      <span className={styles.eventAvatarStack} aria-hidden="true">
        {visibleNames.map((name, index) => (
          <span key={`${name}-${index}`} className={styles.eventAvatar}>
            {Array.from(name)[0]}
          </span>
        ))}
      </span>
      {remainingCount > 0 && <span className={styles.eventParticipantMore}>+{remainingCount}</span>}
    </span>
  );
}

export default function Schedule() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { chatRooms } = useChatRooms(currentUser);
  const { isRoomMuted } = useRoomNotificationSettings();
  const { users, fetchUsers } = useUsers();
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentMonth, setCurrentMonth] = useState(() => startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const visibleDays = useMemo(() => {
    if (viewMode === 'today') return [startOfDay(new Date())];
    if (viewMode === 'week') return getWeekDays(selectedDate);
    return getMonthCalendarDays(currentMonth);
  }, [currentMonth, selectedDate, viewMode]);
  const focusedScheduleId = searchParams.get('scheduleId');
  const scheduleRange = useMemo(() => ({
    startAt: addDays(visibleDays[0], -SCHEDULE_OVERLAP_LOOKBACK_DAYS),
    endAt: addDays(visibleDays[visibleDays.length - 1], 1),
  }), [visibleDays]);
  const {
    schedules,
    loading,
    error: scheduleError,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    updateScheduleOrder,
  } = useSchedules(currentUser, focusedScheduleId ? {} : scheduleRange);

  const [selectedCategoryIds, setSelectedCategoryIds] = useState<ScheduleCategoryId[]>(() => {
    try {
      const raw = localStorage.getItem('schedule.categoryFilter');
      if (!raw) return [];
      const parsed = JSON.parse(raw) as ScheduleCategoryId[];
      const validIds = new Set(SCHEDULE_CATEGORIES.map((category) => category.id));
      return parsed.filter((id) => validIds.has(id));
    } catch {
      return [];
    }
  });
  const today = startOfDay(new Date());
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [previewEvent, setPreviewEvent] = useState<ScheduleEvent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [desktopSearchOpen, setDesktopSearchOpen] = useState(false);
  const [desktopSettingsOpen, setDesktopSettingsOpen] = useState(false);
  const [desktopNewChatOpen, setDesktopNewChatOpen] = useState(false);
  const [embeddedRoomId, setEmbeddedRoomId] = useState<string | null>(null);
  const closeEmbeddedChat = useCallback(() => setEmbeddedRoomId(null), []);
  const scheduleContainerRef = useRef<HTMLDivElement>(null);
  const {
    paneWidth: desktopRoomPaneWidth,
    isResizing: desktopRoomPaneResizing,
    paneStyle: desktopScheduleLayoutStyle,
    handleResizePointerDown: handleDesktopRoomPaneResizePointerDown,
    handleResizeKeyDown: handleDesktopRoomPaneResizeKeyDown,
  } = useDesktopRoomPaneResize(scheduleContainerRef, false);
  const [saving, setSaving] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [activeTimePicker, setActiveTimePicker] = useState<TimePickerField | null>(null);
  const [draftTime, setDraftTime] = useState('09:00');
  const [draggingScheduleId, setDraggingScheduleId] = useState<string | null>(null);
  const [todayScrollRequest, setTodayScrollRequest] = useState(0);
  const monthCalendarRef = useRef<HTMLElement>(null);
  const [focusedScheduleEventId, setFocusedScheduleEventId] = useState<string | null>(null);
  const [scheduleFocusScrollRequest, setScheduleFocusScrollRequest] = useState(0);

  useEffect(() => {
    if (todayScrollRequest === 0 || loading || viewMode !== 'month') return;

    const calendar = monthCalendarRef.current;
    const todayKey = toOrderDateKey(startOfDay(new Date()));
    const target = calendar?.querySelector<HTMLElement>(`[data-calendar-date="${todayKey}"]`);
    if (!calendar || !target) return;

    const calendarRect = calendar.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const weekdayHeader = calendar.querySelector<HTMLElement>(`.${styles.notionWeekdays}`);
    const headerHeight = weekdayHeader?.getBoundingClientRect().height ?? 0;
    const nextScrollTop = calendar.scrollTop + targetRect.top - calendarRect.top - headerHeight - 12;

    calendar.scrollTo({
      top: Math.max(0, nextScrollTop),
      left: calendar.scrollLeft,
      behavior: 'smooth',
    });
  }, [currentMonth, loading, todayScrollRequest, viewMode]);

  useEffect(() => {
    if (!focusedScheduleEventId || scheduleFocusScrollRequest === 0 || loading || viewMode !== 'month') return;

    const calendar = monthCalendarRef.current;
    const target = Array.from(calendar?.querySelectorAll<HTMLElement>('[data-schedule-id]') ?? [])
      .find((element) => element.dataset.scheduleId === focusedScheduleEventId);
    if (!calendar || !target) return;

    const calendarRect = calendar.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const weekdayHeader = calendar.querySelector<HTMLElement>(`.${styles.notionWeekdays}`);
    const headerHeight = weekdayHeader?.getBoundingClientRect().height ?? 0;
    const nextScrollTop = calendar.scrollTop + targetRect.top - calendarRect.top - headerHeight - 16;

    calendar.scrollTo({
      top: Math.max(0, nextScrollTop),
      left: calendar.scrollLeft,
      behavior: 'smooth',
    });
  }, [currentMonth, focusedScheduleEventId, loading, scheduleFocusScrollRequest, schedules, selectedCategoryIds, viewMode]);
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingScheduleMove | null>(null);
  const [copyTargetDate, setCopyTargetDate] = useState('');
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [scheduleContextMenu, setScheduleContextMenu] = useState<ScheduleContextMenu | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(() => createInitialForm(new Date()));
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false);
  const isNarrow = useIsNarrowViewport(ELECTRON_COMPACT_MAX_WIDTH);

  useEffect(() => {
    const navigationState = location.state as ScheduleNavigationState | null;
    const allowNarrowSchedule = navigationState?.allowNarrowSchedule === true;
    if (isElectronEnv() && !isNarrow && allowNarrowSchedule) {
      // 縮小中に利用者が予定表を選び直した許可は、
      // 一度広げたら解除し、次の縮小ではチャット一覧へ戻す。
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
      return;
    }
    if (shouldReturnScheduleToChatList(
      isElectronEnv(),
      isNarrow,
      allowNarrowSchedule,
    )) {
      navigate(getAppEntryPath(), { replace: true });
    }
  }, [isNarrow, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    localStorage.setItem('schedule.categoryFilter', JSON.stringify(selectedCategoryIds));
  }, [selectedCategoryIds]);

  useEffect(() => {
    if (!scheduleContextMenu) return undefined;

    function closeContextMenu() {
      setScheduleContextMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeContextMenu();
    }

    window.addEventListener('click', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [scheduleContextMenu]);

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

  const visibleWeeks = useMemo(() => getCalendarWeeks(visibleDays), [visibleDays]);

  const filteredSchedules = useMemo(
    () => filterSchedulesByCategories(schedules, selectedCategoryIds),
    [schedules, selectedCategoryIds],
  );

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
    setForm(createInitialForm(date));
    setFormOpen(true);
  }

  function toggleCategoryFilter(categoryId: ScheduleCategoryId) {
    setSelectedCategoryIds((current) => (
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId]
    ));
  }

  function clearCategoryFilter() {
    setSelectedCategoryIds([]);
  }

  function openEditForm(event: ScheduleEvent) {
    setEditingEvent(event);
    setUserSearch('');
    setForm(createInitialForm(event.startAt, event));
    setFormOpen(true);
  }

  useEffect(() => {
    const scheduleId = searchParams.get('scheduleId');
    if (!scheduleId || loading || scheduleError) return undefined;
    const target = schedules.find((event) => event.id === scheduleId);
    if (!target) {
      showToast('warning', '予定が見つかりませんでした');
      const next = new URLSearchParams(searchParams);
      next.delete('scheduleId');
      setSearchParams(next, { replace: true });
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setSelectedDate(startOfDay(target.startAt));
      setCurrentMonth(new Date(target.startAt.getFullYear(), target.startAt.getMonth(), 1));
      setSelectedCategoryIds([]);
      setFocusedScheduleEventId(target.id);
      setScheduleFocusScrollRequest((request) => request + 1);
      setPreviewEvent(target);
      const next = new URLSearchParams(searchParams);
      next.delete('scheduleId');
      setSearchParams(next, { replace: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loading, scheduleError, schedules, searchParams, setSearchParams, showToast]);

  function closePreview() {
    setPreviewEvent(null);
  }

  function editPreviewedSchedule() {
    if (!previewEvent) return;
    const target = previewEvent;
    setPreviewEvent(null);
    openEditForm(target);
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

  function openScheduleContextMenu(event: MouseEvent<HTMLElement>, scheduleEvent: ScheduleEvent) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedDate(startOfDay(scheduleEvent.startAt));
    setScheduleContextMenu({
      event: scheduleEvent,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 172)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 144)),
    });
  }

  function openContextEdit(scheduleEvent: ScheduleEvent) {
    setScheduleContextMenu(null);
    openEditForm(scheduleEvent);
  }

  function openContextCopy(scheduleEvent: ScheduleEvent) {
    setScheduleContextMenu(null);
    setEditingEvent(scheduleEvent);
    setForm(createInitialForm(scheduleEvent.startAt, scheduleEvent));
    setCopyTargetDate(toDateInputValue(addDays(scheduleEvent.startAt, 7)));
    setCopyDialogOpen(true);
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
    const categoryId = form.categoryId;
    if (!categoryId) {
      throw new Error('カテゴリを選択してください');
    }
    const targetUserIds = form.targetUserIds;
    const selectedUsers = allUsers.filter((user) => targetUserIds.includes(user.uid));
    const startAt = buildDate(form.startDate, form.startTime, form.allDay);
    const endAt = form.endDate
      ? buildDate(form.endDate, form.endTime, form.allDay, true)
      : null;
    const selectedCustomAt = form.notifyTiming === 'custom'
      ? buildDate(form.customNotifyDate, form.customNotifyTime, false)
      : null;
    const customAt = resolveScheduleNotificationCustomAt(form.notifyTiming, selectedCustomAt);

    return {
      title: form.title.trim(),
      categoryId,
      targetUserIds,
      targetUserNames: selectedUsers.map((user) => user.displayName),
      startAt,
      endAt,
      allDay: form.allDay,
      memo: form.memo.trim(),
      notification: {
        enabled: form.notifyEnabled,
        recipientScope: form.notifyRecipientScope,
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
    if (!form.categoryId) {
      showToast('warning', 'カテゴリを選択してください');
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

  async function deleteScheduleEvent(scheduleEvent: ScheduleEvent) {
    if (!confirm('この予定を削除しますか？')) return;
    setScheduleContextMenu(null);
    setSaving(true);
    try {
      await deleteSchedule(scheduleEvent.id);
      showToast('success', '予定を削除しました');
      if (editingEvent?.id === scheduleEvent.id) {
        closeForm();
      } else {
        setSaving(false);
      }
    } catch (error) {
      console.error('予定削除エラー:', error);
      showToast('error', getScheduleErrorMessage(error, 'delete'), 8000);
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingEvent) return;
    await deleteScheduleEvent(editingEvent);
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
    setTodayScrollRequest((request) => request + 1);
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
    <div ref={scheduleContainerRef} className={styles.container} style={desktopScheduleLayoutStyle}>
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
          <button type="button" className={styles.sidebarPrimary} onClick={() => navigate('/chat')}>
            チャット
          </button>
          <button type="button" className={`${styles.sidebarPrimary} ${styles.active}`} onClick={() => navigate('/schedule')}>
            行動予定表（Beta）
          </button>
          <button type="button" className={styles.sidebarPrimary} onClick={() => navigate('/process')}>
            工程管理（Beta）
          </button>
        </div>
        {embeddedRoomId ? (
          <div className={styles.embeddedChatSlot}>
            <Chat
              embeddedRoomId={embeddedRoomId}
              onEmbeddedBack={closeEmbeddedChat}
            />
          </div>
        ) : (
          <>
            <div className={styles.roomHeader}>
              <span>チャット</span>
              <span aria-hidden="true">⌄</span>
            </div>
            <div className={styles.roomList}>
              {visibleRooms.map((room) => {
                const unread = getUnreadCount(room, currentUser?.uid);
                const favorited = room.favorites?.includes(currentUser?.uid || '') ?? false;
                const avatarUrl = getRoomAvatarUrl(room, currentUser?.uid, users);
                return (
                  <button key={room.id} type="button" className={styles.roomItem} onClick={() => setEmbeddedRoomId(room.id)}>
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
          </>
        )}
      </aside>

      <button
        type="button"
        className={`${styles.sidebarResizeHandle} ${desktopRoomPaneResizing ? styles.dragging : ''}`}
        onPointerDown={handleDesktopRoomPaneResizePointerDown}
        onKeyDown={handleDesktopRoomPaneResizeKeyDown}
        aria-label={`チャット一覧の幅を調整（現在${desktopRoomPaneWidth}px）`}
        title="左右にドラッグしてチャット一覧の幅を調整"
      />

      <main className={styles.main} id="main-content">
        <header className={`${styles.header} ${isNarrow ? styles.mobileHeader : ''}`}>
          {isNarrow ? (
            <>
              <div className={styles.mobileHeaderRow}>
                <h1>{formatMonthLabel(viewMode === 'month' ? currentMonth : selectedDate)}</h1>
                <div className={styles.mobileHeaderNav}>
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
                </div>
              </div>
              <div className={styles.mobileHeaderRow}>
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
                <button
                  type="button"
                  className={styles.filterToggleButton}
                  onClick={() => setCategoryFilterOpen((open) => !open)}
                  aria-expanded={categoryFilterOpen}
                >
                  絞り込み
                  {selectedCategoryIds.length > 0 && (
                    <span className={styles.filterBadge}>{selectedCategoryIds.length}</span>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </header>

        {(!isNarrow || categoryFilterOpen) && (
          <section className={styles.categoryFilterBar} aria-label="カテゴリフィルタ">
            <button
              type="button"
              className={selectedCategoryIds.length === 0 ? styles.categoryFilterActive : ''}
              onClick={clearCategoryFilter}
            >
              すべて
            </button>
            {SCHEDULE_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                className={selectedCategoryIds.includes(category.id) ? styles.categoryFilterActive : ''}
                onClick={() => toggleCategoryFilter(category.id)}
              >
                {category.label}
              </button>
            ))}
          </section>
        )}

        {loading ? (
          <div className={styles.loading}>行動予定を読み込み中...</div>
        ) : scheduleError ? (
          <div className={styles.errorPanel} role="alert">
            <strong>予定を取得できません</strong>
            <span>{getScheduleErrorMessage(scheduleError, 'load')}</span>
          </div>
        ) : isNarrow && viewMode === 'month' ? (
          <MobileMonthView
            monthDays={visibleDays}
            currentMonth={currentMonth}
            selectedDate={selectedDate}
            today={today}
            events={filteredSchedules}
            onSelectDate={setSelectedDate}
            onOpenEvent={(event) => {
              setSelectedDate(startOfDay(event.startAt));
              openEditForm(event);
            }}
            onContextMenu={openScheduleContextMenu}
          />
        ) : isNarrow ? (
          <MobileAgendaView
            days={visibleDays}
            today={today}
            events={filteredSchedules}
            onOpenEvent={(event) => {
              setSelectedDate(startOfDay(event.startAt));
              openEditForm(event);
            }}
            onContextMenu={openScheduleContextMenu}
          />
        ) : viewMode === 'month' ? (
          <section ref={monthCalendarRef} className={styles.notionCalendar}>
            <div className={styles.notionWeekdays}>
              {WEEKDAYS.map((day) => (
                <div key={day} className={styles.weekday}>{day}</div>
              ))}
            </div>
            {visibleWeeks.map((weekDays) => {
              const weekEvents = buildWeekEvents(filteredSchedules.filter(isMultiDayEvent), weekDays);
              const laneCount = Math.max(0, ...weekEvents.map((weekEvent) => weekEvent.lane + 1));
              const singleDayEventsByDate = new Map(
                weekDays.map((day) => {
                  const dateKey = toOrderDateKey(day);
                  return [
                    dateKey,
                    filteredSchedules
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
                    const hasHoliday = filteredSchedules.some((event) => (
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
                        <span className={styles.dayNumber} data-calendar-date={toOrderDateKey(day)}>{day.getDate()}</span>
                        <span className={styles.singleDayEvents}>
                          {singleDayEvents.map((event) => {
                            const category = SCHEDULE_CATEGORY_BY_ID[event.categoryId] ?? SCHEDULE_CATEGORY_BY_ID.other;
                            return (
                              <button
                                key={event.id}
                                type="button"
                                draggable
                                data-schedule-id={event.id}
                                className={`${styles.notionEventBar} ${styles.singleDayEventBar} ${styles[category.tone]} ${focusedScheduleEventId === event.id ? styles.focusedScheduleEvent : ''} ${draggingScheduleId === event.id ? styles.draggingEvent : ''}`}
                                onDragStart={(dragEvent) => handleScheduleDragStart(dragEvent, event)}
                                onDragEnd={endScheduleDrag}
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation();
                                  setSelectedDate(startOfDay(event.startAt));
                                  openEditForm(event);
                                }}
                                onContextMenu={(contextEvent) => openScheduleContextMenu(contextEvent, event)}
                                onDoubleClick={(doubleClickEvent) => {
                                  doubleClickEvent.stopPropagation();
                                }}
                              >
                                <strong>{event.title}</strong>
                                <small>{category.label}</small>
                                <span className={styles.eventFooter}>
                                  <em>{formatEventTime(event)}</em>
                                  <EventParticipants targetUserNames={event.targetUserNames} />
                                </span>
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
                        className={`${styles.notionEventBar} ${styles[category.tone]} ${focusedScheduleEventId === event.id ? styles.focusedScheduleEvent : ''} ${draggingScheduleId === event.id ? styles.draggingEvent : ''}`}
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
                        onContextMenu={(contextEvent) => openScheduleContextMenu(contextEvent, event)}
                      >
                        <strong>{event.title}</strong>
                        <small>{category.label}</small>
                        <span className={styles.eventFooter}>
                          <em>{formatEventTime(event)}</em>
                          <EventParticipants targetUserNames={event.targetUserNames} />
                        </span>
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
              const dayEvents = filteredSchedules
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
                          className={`${styles.eventChip} ${styles[category.tone]} ${focusedScheduleEventId === event.id ? styles.focusedScheduleEvent : ''} ${draggingScheduleId === event.id ? styles.draggingEvent : ''}`}
                          onDragStart={(dragEvent) => handleScheduleDragStart(dragEvent, event)}
                          onDragEnd={endScheduleDrag}
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            openEditForm(event);
                          }}
                          onContextMenu={(contextEvent) => openScheduleContextMenu(contextEvent, event)}
                          onDoubleClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                          }}
                        >
                          <strong>{event.title}</strong>
                          <small>{category.label}</small>
                          <span className={styles.eventFooter}>
                            {!event.allDay && <em>{formatEventTime(event)}</em>}
                            <EventParticipants targetUserNames={event.targetUserNames} />
                          </span>
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

      {isNarrow && (
        <button
          type="button"
          className={styles.mobileFab}
          onClick={() => openCreateForm()}
          aria-label="予定を追加"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}

      {previewEvent && (
        <div className={styles.modalOverlay} onMouseDown={(event) => {
          if (event.target === event.currentTarget) closePreview();
        }}>
          <section
            className={styles.schedulePreview}
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-preview-title"
          >
            <div className={styles.previewHeader}>
              <span className={styles.previewBadge}>行動予定表</span>
              <button type="button" onClick={closePreview} aria-label="閉じる">×</button>
            </div>
            <h2 id="schedule-preview-title">{previewEvent.title}</h2>
            <dl className={styles.previewDetails}>
              <div>
                <dt>カテゴリ</dt>
                <dd>{SCHEDULE_CATEGORY_BY_ID[previewEvent.categoryId]?.label ?? 'その他'}</dd>
              </div>
              <div>
                <dt>日時</dt>
                <dd>{formatScheduleNotificationDateTime(previewEvent)}</dd>
              </div>
              <div>
                <dt>対象</dt>
                <dd>
                  {previewEvent.targetUserNames.length > 0
                    ? previewEvent.targetUserNames.join('、')
                    : previewEvent.createdByName || '未設定'}
                </dd>
              </div>
              {previewEvent.memo && (
                <div>
                  <dt>メモ</dt>
                  <dd>{previewEvent.memo}</dd>
                </div>
              )}
            </dl>
            <div className={styles.previewActions}>
              <button type="button" className={styles.cancelButton} onClick={closePreview}>閉じる</button>
              <button type="button" className={styles.previewEditButton} onClick={editPreviewedSchedule}>編集する</button>
            </div>
          </section>
        </div>
      )}

      {formOpen && (
        <div className={styles.modalOverlay} onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeForm();
        }}>
          <form className={`${styles.modal} ${styles.scheduleFormModal}`} onSubmit={handleSubmit}>
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
              <select
                value={form.categoryId}
                className={!form.categoryId ? styles.placeholderSelect : undefined}
                onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value as ScheduleCategoryId | '' }))}
              >
                <option value="" disabled>選択してください</option>
                {SCHEDULE_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>{category.label}</option>
                ))}
              </select>
            </label>

            <div className={styles.field}>
              <div className={styles.fieldHeader}>
                <span>対象ユーザー</span>
                <em>{form.targetUserIds.length}人選択中</em>
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
                  <span>未選択のままでも登録できます</span>
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

            <fieldset className={styles.notificationAudience}>
              <legend>通知</legend>
              <div className={styles.notificationAudienceOptions}>
                <label aria-label="通知しない" htmlFor="notification-audience-none" className={!form.notifyEnabled ? styles.notificationAudienceSelected : undefined}>
                  <input
                    id="notification-audience-none"
                    type="radio"
                    name="notificationAudience"
                    checked={!form.notifyEnabled}
                    onChange={() => setForm((prev) => ({ ...prev, notifyEnabled: false }))}
                  />
                  <span>
                    <strong>通知しない</strong>
                    <small>通知を送信しません</small>
                  </span>
                </label>
                <label aria-label="対象メンバーに通知" htmlFor="notification-audience-targets" className={form.notifyEnabled && form.notifyRecipientScope === 'targets' ? styles.notificationAudienceSelected : undefined}>
                  <input
                    id="notification-audience-targets"
                    type="radio"
                    name="notificationAudience"
                    checked={form.notifyEnabled && form.notifyRecipientScope === 'targets'}
                    onChange={() => setForm((prev) => ({
                      ...prev,
                      notifyEnabled: true,
                      notifyRecipientScope: 'targets',
                      notifyTiming: 'atStart',
                    }))}
                  />
                  <span>
                    <strong>対象メンバーに通知</strong>
                    <small>
                      {form.targetUserIds.length > 0
                        ? `選択中の${form.targetUserIds.length}人に通知します`
                        : '対象未選択のため作成者に通知します'}
                    </small>
                  </span>
                </label>
                <label aria-label="全員に通知" htmlFor="notification-audience-all" className={form.notifyEnabled && form.notifyRecipientScope === 'all' ? styles.notificationAudienceSelected : undefined}>
                  <input
                    id="notification-audience-all"
                    type="radio"
                    name="notificationAudience"
                    checked={form.notifyEnabled && form.notifyRecipientScope === 'all'}
                    onChange={() => setForm((prev) => ({
                      ...prev,
                      notifyEnabled: true,
                      notifyRecipientScope: 'all',
                      notifyTiming: 'atStart',
                    }))}
                  />
                  <span>
                    <strong>全員に通知</strong>
                    <small>登録ユーザー{allUsers.length}人に通知します</small>
                  </span>
                </label>
              </div>
              {form.notifyEnabled && form.notifyRecipientScope === 'all' && (
                <p className={styles.notificationAudienceHint}>
                  全員に通知すると、予定の対象外メンバーにも届きます
                </p>
              )}
            </fieldset>
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

      {scheduleContextMenu && (
        <div
          className={styles.scheduleContextMenu}
          style={{ left: scheduleContextMenu.x, top: scheduleContextMenu.y }}
          role="menu"
          tabIndex={-1}
          aria-label="予定の操作"
          onClick={(clickEvent) => clickEvent.stopPropagation()}
          onContextMenu={(contextEvent) => contextEvent.preventDefault()}
        >
          <button type="button" role="menuitem" onClick={() => openContextEdit(scheduleContextMenu.event)}>
            編集
          </button>
          <button type="button" role="menuitem" onClick={() => openContextCopy(scheduleContextMenu.event)}>
            コピー
          </button>
          <button type="button" role="menuitem" className={styles.contextDelete} onClick={() => void deleteScheduleEvent(scheduleContextMenu.event)}>
            削除
          </button>
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
        onOpenSettings={() => setDesktopSettingsOpen(true)}
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
