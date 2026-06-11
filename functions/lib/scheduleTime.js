"use strict";
// 行動予定表の通知タイミング計算。index.ts から機械的に移動（挙動変更なし）。
// クライアント側 src/utils/scheduleNotifications.ts と同じ仕様（前日17時 / 当日8時30分）。
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEDULE_NOTIFICATION_GRACE_MS = void 0;
exports.getScheduleNotificationTime = getScheduleNotificationTime;
exports.SCHEDULE_NOTIFICATION_GRACE_MS = 2 * 60 * 1000;
function withTime(date, hours, minutes) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}
function getScheduleNotificationTime(schedule, timing) {
    var _a, _b, _c, _d;
    const startAt = (_a = schedule.startAt) === null || _a === void 0 ? void 0 : _a.toDate();
    if (!startAt)
        return null;
    if (timing === 'custom')
        return (_d = (_c = (_b = schedule.notification) === null || _b === void 0 ? void 0 : _b.customAt) === null || _c === void 0 ? void 0 : _c.toDate()) !== null && _d !== void 0 ? _d : null;
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
        case 'atStart':
            return startAt;
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