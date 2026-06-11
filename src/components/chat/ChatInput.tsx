import { useRef } from 'react';
import styles from '../../pages/Chat.module.css';
import type { ExtendedMessage } from './types';
import { MAX_TEXTAREA_HEIGHT } from '../../constants';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onFileSelect: (files: FileList) => void;
  disabled: boolean;
  uploading: boolean;
  replyingTo: ExtendedMessage | null;
  onCancelReply: () => void;
  showMentionList: boolean;
  filteredMembers: Array<{ uid: string; displayName: string; photoURL?: string | null }>;
  onSelectMention: (displayName: string, uid: string) => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  onFileSelect,
  disabled,
  uploading,
  replyingTo,
  onCancelReply,
  showMentionList,
  filteredMembers,
  onSelectMention,
  inputRef
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localInputRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef || localInputRef;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
    onChange(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter で送信、Shift+Enter で改行（IME 変換中の Enter は無視）
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing &&
      value.trim() &&
      !disabled
    ) {
      e.preventDefault();
      onSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <>
      {/* 返信プレビュー */}
      {replyingTo && (
        <div className={styles.replyingBar}>
          <div className={styles.replyingContent}>
            <span className={styles.replyingLabel}>返信: {replyingTo.senderName}</span>
            <p className={styles.replyingText}>
              {replyingTo.text.substring(0, 50)}{replyingTo.text.length > 50 ? '...' : ''}
            </p>
          </div>
          <button className={styles.cancelReply} onClick={onCancelReply}>×</button>
        </div>
      )}

      {/* 入力エリア */}
      <div className={styles.inputArea}>
        {/* メンションリスト */}
        {showMentionList && filteredMembers.length > 0 && (
          <div className={styles.mentionList}>
            {filteredMembers.map(member => (
              <button
                key={member.uid}
                type="button"
                className={styles.mentionItem}
                onClick={() => onSelectMention(member.displayName, member.uid)}
              >
                @{member.displayName}
              </button>
            ))}
          </div>
        )}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: 'none' }}
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        />
        <button
          type="button"
          className={styles.attachButton}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="ファイルを添付"
        >
          {uploading ? (
            <span className={styles.uploadingSpinner}>...</span>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          )}
        </button>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを入力... (Enterで送信 / Shift+Enterで改行)"
          className={styles.messageInput}
          disabled={disabled}
          rows={1}
        />
        <button
          type="button"
          className={styles.sendButton}
          disabled={!value.trim() || disabled}
          onClick={onSend}
        >
          {disabled ? '...' : '送信'}
        </button>
      </div>
    </>
  );
}
