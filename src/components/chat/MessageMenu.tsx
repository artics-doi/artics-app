import styles from '../../pages/Chat.module.css';
import type { ExtendedMessage } from './types';

interface MessageMenuProps {
  message: ExtendedMessage;
  isOwnMessage: boolean;
  onReply: () => void;
  onCopy: () => void;
  onReaction: () => void;
  onPin: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function MessageMenu({
  message,
  isOwnMessage,
  onReply,
  onCopy,
  onReaction,
  onPin,
  onEdit,
  onDelete
}: MessageMenuProps) {
  return (
    <div
      className={styles.messageMenu}
      role="presentation"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button onClick={onReply}>
        返信
      </button>
      {!message.isDeleted && message.text && (
        <button onClick={onCopy}>
          コピー
        </button>
      )}
      <button onClick={onReaction}>
        リアクション
      </button>
      <button onClick={onPin}>
        {message.isPinned ? 'ピン解除' : 'ピン留め'}
      </button>
      {isOwnMessage && !message.isDeleted && (
        <>
          <button onClick={onEdit}>
            編集
          </button>
          <button
            className={styles.deleteOption}
            onClick={onDelete}
          >
            削除
          </button>
        </>
      )}
    </div>
  );
}
