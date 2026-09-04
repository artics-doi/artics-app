import type { ExtendedMessage } from '../../types';
import type { ScheduleFormState } from '../schedule/form';
import { createInitialForm } from '../schedule/form';
import type { TaskInput } from '../../types/process';

const TITLE_MAX_LENGTH = 80;

export function messageToTitle(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= TITLE_MAX_LENGTH) return compact;
  return `${compact.slice(0, TITLE_MAX_LENGTH - 3)}...`;
}

export function createScheduleFormFromMessage(message: ExtendedMessage, date = new Date()): ScheduleFormState {
  return {
    ...createInitialForm(date),
    title: messageToTitle(message.text || 'チャットから予定'),
    memo: message.text,
  };
}

export function createTaskInputFromMessage(message: ExtendedMessage, columnId: string): TaskInput {
  const sentAt = message.createdAt instanceof Date
    ? `${message.createdAt.getFullYear()}/${message.createdAt.getMonth() + 1}/${message.createdAt.getDate()} ${message.createdAt.getHours().toString().padStart(2, '0')}:${message.createdAt.getMinutes().toString().padStart(2, '0')}`
    : '';
  const sourceLines = [
    message.text,
    '',
    `送信者: ${message.senderName}`,
    sentAt ? `送信日時: ${sentAt}` : '',
    `元チャット: /chat/${message.chatRoomId}?messageId=${message.id}`,
  ].filter(Boolean);

  return {
    title: messageToTitle(message.text || 'チャットからタスク'),
    columnId,
    assigneeIds: [],
    startDate: null,
    endDate: null,
    completedDate: null,
    completionChecked: false,
    description: sourceLines.join('\n'),
  };
}
