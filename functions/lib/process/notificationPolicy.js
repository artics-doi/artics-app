"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROCESS_EVENTS = void 0;
exports.resolveProcessEvent = resolveProcessEvent;
exports.processRecipientIds = processRecipientIds;
exports.processNotificationUrl = processNotificationUrl;
function columnKind(column) {
    if (column.kind)
        return column.kind;
    if (column.id === 'todo' || /未着手|未対応/.test(column.name))
        return 'todo';
    if (column.id === 'doing' || /進行|対応中/.test(column.name))
        return 'doing';
    if (column.id === 'done' || /完了/.test(column.name))
        return 'done';
    if (column.id === 'hold' || /保留/.test(column.name))
        return 'hold';
    return 'custom';
}
function resolveProcessEvent(before, after, project) {
    var _a, _b;
    if (!after || project.status === 'archived' || project.pendingDelete === true || project.lifecycleState === 'deleting')
        return null;
    if (after.archived === true || after.isArchived === true || (before === null || before === void 0 ? void 0 : before.archived) === true || (before === null || before === void 0 ? void 0 : before.isArchived) === true)
        return null;
    const columns = (Array.isArray(project.columns) ? project.columns : []).filter((value) => !!value && typeof value.id === 'string' && typeof value.name === 'string');
    const next = columns.find(column => column.id === after.columnId);
    if (!next)
        return null;
    const kind = columnKind(next);
    if (before && before.columnId === after.columnId) {
        // 完了列の未チェック→チェックだけを承認とする。解除や承認済みの編集は通知しない。
        if (kind !== 'done' || before.completionChecked === true || after.completionChecked !== true)
            return null;
        return { event: 'approved', previousStatus: '承認前', nextStatus: '完了承認' };
    }
    if (before && !['todo', 'doing', 'done', 'hold'].includes(kind))
        return null;
    return {
        event: (before ? kind : 'created'),
        previousStatus: before ? (_b = (_a = columns.find(column => column.id === before.columnId)) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : '変更前' : '',
        nextStatus: next.name,
    };
}
exports.PROCESS_EVENTS = ['created', 'todo', 'doing', 'done', 'approved', 'hold'];
function processRecipientIds(members, event, assigneeIds) {
    if (!exports.PROCESS_EVENTS.includes(event))
        return [];
    const assigned = new Set(Array.isArray(assigneeIds) ? assigneeIds.filter(id => typeof id === 'string') : []);
    return [...new Set(members.filter(member => {
            const settings = member.notification;
            if (typeof member.linkedUserId !== 'string' || !member.linkedUserId || member.linkedUserId.includes('/'))
                return false;
            if (member.isTaskProgressManager === true)
                return true;
            // assigneeIdsはAuth UIDではなくprocessMembersの文書ID。旧enabledは参照しない。
            const events = Array.isArray(settings === null || settings === void 0 ? void 0 : settings.events) ? settings.events : exports.PROCESS_EVENTS;
            return typeof member.id === 'string' && assigned.has(member.id) && events.includes(event);
        }).map(member => member.linkedUserId))];
}
function processNotificationUrl(projectId, taskId) {
    return `/#/process/projects/${encodeURIComponent(projectId)}/board?task=${encodeURIComponent(taskId)}&from=notification`;
}
//# sourceMappingURL=notificationPolicy.js.map