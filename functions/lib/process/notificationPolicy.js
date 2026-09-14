"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
    if (before && before.columnId === after.columnId)
        return null;
    const columns = (Array.isArray(project.columns) ? project.columns : []).filter((value) => !!value && typeof value.id === 'string' && typeof value.name === 'string');
    const next = columns.find(column => column.id === after.columnId);
    if (!next)
        return null;
    const kind = columnKind(next);
    if (before && !['todo', 'doing', 'done', 'hold'].includes(kind))
        return null;
    return {
        event: (before ? kind : 'created'),
        previousStatus: before ? (_b = (_a = columns.find(column => column.id === before.columnId)) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : '変更前' : '',
        nextStatus: next.name,
    };
}
function processRecipientIds(members, event) {
    return [...new Set(members.filter(member => {
            const settings = member.notification;
            return typeof member.linkedUserId === 'string' && member.linkedUserId.length > 0 && !member.linkedUserId.includes('/')
                && (settings === null || settings === void 0 ? void 0 : settings.enabled) === true && Array.isArray(settings.events) && settings.events.includes(event);
        }).map(member => member.linkedUserId))];
}
function processNotificationUrl(projectId, taskId) {
    return `/#/process/projects/${encodeURIComponent(projectId)}/board?task=${encodeURIComponent(taskId)}&from=notification`;
}
//# sourceMappingURL=notificationPolicy.js.map