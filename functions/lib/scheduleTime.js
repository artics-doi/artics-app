"use strict";
// 行動予定表の通知タイミング計算。index.ts から機械的に移動（挙動変更なし）。
// クライアント側 src/utils/scheduleNotifications.ts と同じ仕様。
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEDULE_NOTIFICATION_GRACE_MS = void 0;
exports.resolveScheduleRecipientIds = resolveScheduleRecipientIds;
exports.getScheduleNotificationTime = getScheduleNotificationTime;
exports.SCHEDULE_NOTIFICATION_GRACE_MS = 2 * 60 * 1000;
function resolveScheduleRecipientIds(schedule, allActiveUserIds = []) {
    var _a, _b;
    if (((_a = schedule.notification) === null || _a === void 0 ? void 0 : _a.recipientScope) === 'all')
        return allActiveUserIds;
    if ((_b = schedule.targetUserIds) === null || _b === void 0 ? void 0 : _b.length)
        return schedule.targetUserIds;
    return schedule.createdBy ? [schedule.createdBy] : [];
}
function withTime(date, hours, minutes) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}
function getScheduleNotificationTime(schedule, timing) {
    var _a, _b, _c, _d, _e, _f, _g;
    const startAt = (_a = schedule.startAt) === null || _a === void 0 ? void 0 : _a.toDate();
    if (!startAt)
        return null;
    // 新規・更新した予定は customAt に保存時刻を保持する。旧データは開始時刻へフォールバックする。
    if (timing === 'atStart')
        return (_d = (_c = (_b = schedule.notification) === null || _b === void 0 ? void 0 : _b.customAt) === null || _c === void 0 ? void 0 : _c.toDate()) !== null && _d !== void 0 ? _d : startAt;
    if (timing === 'custom')
        return (_g = (_f = (_e = schedule.notification) === null || _e === void 0 ? void 0 : _e.customAt) === null || _f === void 0 ? void 0 : _f.toDate()) !== null && _g !== void 0 ? _g : null;
    if (schedule.allDay !== false) {
        const startDay = new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate());
        if (timing === 'previousDayEvening') {
            const previousDay = new Date(startDay);
            previousDay.setDate(previousDay.getDate() - 1);
            return withTime(previousDay, 17, 0);
        }
        return withTime(startDay, 8, 30);
    }
    switch (timing) {
        case 'fiveMinutesBefore':
            return new Date(startAt.getTime() - 5 * 60 * 1000);
        case 'fifteenMinutesBefore':
            return new Date(startAt.getTime() - 15 * 60 * 1000);
        case 'thirtyMinutesBefore':
            return new Date(startAt.getTime() - 30 * 60 * 1000);
        case 'oneHourBefore':
            return new Date(startAt.getTime() - 60 * 60 * 1000);
        case 'previousDayEvening': {
            const previousDay = new Date(startAt);
            previousDay.setDate(previousDay.getDate() - 1);
            return withTime(previousDay, 17, 0);
        }
        case 'sameDayMorning':
            return withTime(startAt, 8, 30);
        default:
            return null;
    }
}
//# sourceMappingURL=scheduleTime.js.map