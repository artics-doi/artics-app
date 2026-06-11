// メッセージ一覧（日付/未読区切り・メニュー・リアクションピッカー・編集・失敗時アクション含む）。
// Chat.tsx から機械的に移動（挙動変更なし）。状態と Firestore 操作はすべて親が保持し props で受け取る。
// スタイルは親ページの Chat.module.css をそのまま使う。

import { Fragment, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { ChatRoom, ExtendedMessage } from '../../types';
import type { MenuPosition } from '../../lib/chat/menuPosition';
import type { ToastType } from '../../contexts/ToastContext';
import { getReactionEntries, hasUserReacted } from '../../lib/chat/reactions';
import { formatDateLabel, formatTimeSmart } from '../../utils/dateUtils';
import { downloadFile } from '../../utils/fileDownload';
import { PRIMARY_REACTION_EMOJIS, SECONDARY_REACTION_EMOJIS } from '../../constants';
import MessageBubbleInteractive from './MessageBubbleInteractive';
import { renderMessageText } from './messageText';
import styles from '../../pages/Chat.module.css';

const formatTime = formatTimeSmart;

interface ChatMessageListProps {
  messages: ExtendedMessage[];
  pendingDeleteIds: Set<string>;
  firstUnreadMessageId: string | null;
  currentUser: FirebaseUser | null;
  chatRoom: ChatRoom | null;
  loadingMore: boolean;
  messageListRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  messageInputRef: RefObject<HTMLTextAreaElement | null>;
  onScroll: () => void;
  getReadStatus: (message: ExtendedMessage) => string;
  calculateMenuPosition: (messageId: string) => MenuPosition;
  menuPosition: MenuPosition;
  setMenuPosition: Dispatch<SetStateAction<MenuPosition>>;
  showMessageMenu: string | null;
  setShowMessageMenu: Dispatch<SetStateAction<string | null>>;
  showReactionPicker: string | null;
  setShowReactionPicker: Dispatch<SetStateAction<string | null>>;
  showSecondaryReactions: boolean;
  setShowSecondaryReactions: Dispatch<SetStateAction<boolean>>;
  editingMessageId: string | null;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  editText: string;
  setEditText: Dispatch<SetStateAction<string>>;
  setReplyingTo: Dispatch<SetStateAction<ExtendedMessage | null>>;
  setShowReadDetail: Dispatch<SetStateAction<{ messageId: string; readBy: string[] } | null>>;
  setPreviewImage: Dispatch<SetStateAction<{ url: string; fileName: string } | null>>;
  copyMessageText: (text: string) => void;
  togglePin: (messageId: string) => void;
  openDeleteMessageConfirm: (messageId: string) => void;
  saveEdit: (messageId: string) => void;
  addReaction: (messageId: string, emoji: string) => void;
  removeReaction: (messageId: string, emoji: string) => Promise<void>;
  showReactionUsers: (messageId: string, emoji: string, userIds: string[]) => void;
  retryFailedMessage: (message: ExtendedMessage) => void;
  dismissOptimistic: (messageId: string) => void;
  showToast: (type: ToastType, message: string) => void;
}

export default function ChatMessageList({
  messages,
  pendingDeleteIds,
  firstUnreadMessageId,
  currentUser,
  chatRoom,
  loadingMore,
  messageListRef,
  messagesEndRef,
  messageInputRef,
  onScroll,
  getReadStatus,
  calculateMenuPosition,
  menuPosition,
  setMenuPosition,
  showMessageMenu,
  setShowMessageMenu,
  showReactionPicker,
  setShowReactionPicker,
  showSecondaryReactions,
  setShowSecondaryReactions,
  editingMessageId,
  setEditingMessageId,
  editText,
  setEditText,
  setReplyingTo,
  setShowReadDetail,
  setPreviewImage,
  copyMessageText,
  togglePin,
  openDeleteMessageConfirm,
  saveEdit,
  addReaction,
  removeReaction,
  showReactionUsers,
  retryFailedMessage,
  dismissOptimistic,
  showToast,
}: ChatMessageListProps) {
  return (
    <div className={styles.messageList} ref={messageListRef} onScroll={onScroll}>
      {loadingMore && (
        <div className={styles.loadingMore}>読み込み中...</div>
      )}
      {messages.length === 0 ? (
        <div className={styles.empty}>
          <p>メッセージがありません</p>
          <p>最初のメッセージを送信しましょう</p>
        </div>
      ) : (
        // H-8: 削除予約中のメッセージは UI 上で非表示
        messages.filter((m) => !pendingDeleteIds.has(m.id)).map((message, index, visible) => {
          const previousMessage = index > 0 ? visible[index - 1] : null;
          const currentDateStr = message.createdAt?.toDateString() ?? '';
          const previousDateStr = previousMessage?.createdAt?.toDateString() ?? null;
          const showDateDivider = Boolean(currentDateStr) && (!previousDateStr || currentDateStr !== previousDateStr);
          const showUnreadDivider = firstUnreadMessageId === message.id;

          return (
            <Fragment key={message.id}>
              {showDateDivider && (
                <div className={styles.dateDivider}>
                  <span className={styles.dateDividerText}>
                    {formatDateLabel(message.createdAt)}
                  </span>
                </div>
              )}
              {showUnreadDivider && (
                <div className={styles.unreadDivider}>
                  <span className={styles.unreadDividerText}>ここから未読メッセージ</span>
                </div>
              )}
              <div
                id={`message-${message.id}`}
                className={`${styles.messageWrapper} ${
                  message.senderId === currentUser?.uid ? styles.own : ''
                } ${message.isPinned ? styles.pinned : ''} ${
                  message._pending === 'sending' ? styles.pending : ''
                } ${message._pending === 'failed' ? styles.failed : ''}`}
              >
                {message.senderId !== currentUser?.uid && (
                  <div className={styles.messageAvatar}>
                    {message.senderPhotoURL ? (
                      <img src={message.senderPhotoURL} alt="" className={styles.messageAvatarImg} />
                    ) : (
                      <svg className={styles.messageAvatarSilhouette} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                      </svg>
                    )}
                  </div>
                )}
                <div className={styles.messageBody}>
                  {message.senderId !== currentUser?.uid && chatRoom?.type === 'group' && (
                    <span className={styles.senderName}>{message.senderName}</span>
                  )}

                  {/* 返信元の表示 */}
                  {message.replyTo && (
                    <div
                      className={styles.replyPreview}
                      onClick={() => {
                        const element = document.getElementById(`message-${message.replyTo?.messageId}`);
                        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                    >
                      <span className={styles.replyLabel}>返信: {message.replyTo.senderName}</span>
                      <p className={styles.replyText}>{message.replyTo.text}</p>
                    </div>
                  )}

                  <div className={styles.messageRow}>
                    {message.senderId === currentUser?.uid && (
                      <div className={styles.messageInfo}>
                        {message.readBy.length > 1 ? (
                          <span
                            className={`${styles.readStatus} ${styles.clickable}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowReadDetail({
                                messageId: message.id,
                                readBy: message.readBy.filter(uid => uid !== currentUser?.uid)
                              });
                            }}
                          >
                            {getReadStatus(message)}
                          </span>
                        ) : (
                          <span className={styles.readStatus}>{getReadStatus(message)}</span>
                        )}
                        <span className={styles.messageTime}>{formatTime(message.createdAt)}</span>
                      </div>
                    )}

                    <MessageBubbleInteractive
                      messageId={message.id}
                      className={styles.messageContainer}
                      onToggleMenu={(id) => {
                        if (showMessageMenu === id) {
                          setShowMessageMenu(null);
                        } else {
                          setMenuPosition(calculateMenuPosition(id));
                          setShowMessageMenu(id);
                        }
                      }}
                    >
                      {/* メッセージメニュー（送信中の楽観的メッセージは Firestore 未確定のため非表示） */}
                      {showMessageMenu === message.id && !message._pending && (
                        <div
                          className={`${styles.messageMenu} ${menuPosition.vertical === 'below' ? styles.menuBelow : ''}`}
                          data-menu-horizontal={menuPosition.horizontal}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button onClick={() => {
                            setReplyingTo(message);
                            setShowMessageMenu(null);
                            messageInputRef.current?.focus();
                          }}>
                            返信
                          </button>
                          {!message.isDeleted && message.text && (
                            <button onClick={() => copyMessageText(message.text)}>
                              コピー
                            </button>
                          )}
                          <button onClick={() => {
                            setMenuPosition(calculateMenuPosition(message.id));
                            setShowReactionPicker(message.id);
                            setShowSecondaryReactions(false);
                            setShowMessageMenu(null);
                          }}>
                            リアクション
                          </button>
                          <button onClick={() => {
                            togglePin(message.id);
                            setShowMessageMenu(null);
                          }}>
                            {message.isPinned ? 'ピン解除' : 'ピン留め'}
                          </button>
                          {message.senderId === currentUser?.uid && !message.isDeleted && (
                            <>
                              <button onClick={() => {
                                setEditingMessageId(message.id);
                                setEditText(message.text);
                                setShowMessageMenu(null);
                              }}>
                                編集
                              </button>
                              <button
                                className={styles.deleteOption}
                                onClick={() => openDeleteMessageConfirm(message.id)}
                              >
                                削除
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* リアクションピッカー（M-7: 主要 8 + もっと見るで二次 14） */}
                      {showReactionPicker === message.id && (
                        <div
                          className={`${styles.reactionPicker} ${menuPosition.vertical === 'below' ? styles.pickerBelow : ''}`}
                          data-menu-horizontal={menuPosition.horizontal}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {PRIMARY_REACTION_EMOJIS.map(emoji => (
                            <button
                              key={emoji}
                              onClick={() => addReaction(message.id, emoji)}
                              className={hasUserReacted(message, emoji, currentUser?.uid) ? styles.reacted : ''}
                              aria-label={`${emoji} のリアクションを追加`}
                            >
                              {emoji}
                            </button>
                          ))}
                          {!showSecondaryReactions ? (
                            <button
                              className={styles.reactionMore}
                              onClick={() => setShowSecondaryReactions(true)}
                              aria-label="他のリアクションを表示"
                              title="もっと見る"
                            >
                              ＋
                            </button>
                          ) : (
                            SECONDARY_REACTION_EMOJIS.map(emoji => (
                              <button
                                key={emoji}
                                onClick={() => addReaction(message.id, emoji)}
                                className={hasUserReacted(message, emoji, currentUser?.uid) ? styles.reacted : ''}
                                aria-label={`${emoji} のリアクションを追加`}
                              >
                                {emoji}
                              </button>
                            ))
                          )}
                        </div>
                      )}

                      <div className={styles.message}>
                        {message.isDeleted ? (
                          <p className={styles.deletedMessage}>
                            {/* L-4: 削除済みメッセージにゴミ箱アイコン */}
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 4, verticalAlign: 'middle' }} aria-hidden="true">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            このメッセージは削除されました
                          </p>
                        ) : (
                          <>
                            {message.imageURL && (
                              <img
                                src={message.imageURL}
                                alt="送信画像"
                                className={styles.messageImage}
                                onClick={() => setPreviewImage({ url: message.imageURL!, fileName: message.fileName || '画像' })}
                              />
                            )}
                            {message.fileURL && (
                              <button
                                className={styles.fileDownloadBtn}
                                onClick={() => downloadFile(message.fileURL!, message.fileName || 'download')}
                              >
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                {message.fileName}
                              </button>
                            )}
                            {(message as ExtendedMessage & { fileDeleted?: boolean }).fileDeleted && !message.imageURL && !message.fileURL && (
                              <p className={styles.deletedFile}>このファイルは期限切れのため削除されました</p>
                            )}
                            {editingMessageId === message.id ? (
                              <div className={styles.editArea}>
                                <textarea
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.ctrlKey && e.key === 'Enter') {
                                      e.preventDefault();
                                      saveEdit(message.id);
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      setEditingMessageId(null);
                                      setEditText('');
                                    }
                                  }}
                                  className={styles.editTextarea}
                                  rows={Math.min(Math.max(editText.split('\n').length, 1), 5)}
                                />
                                <div className={styles.editFooter}>
                                  <span className={styles.editHint}>Ctrl+Enter: 保存 / Esc: キャンセル</span>
                                  <div className={styles.editButtons}>
                                    <button onClick={() => saveEdit(message.id)}>保存</button>
                                    <button onClick={() => {
                                      setEditingMessageId(null);
                                      setEditText('');
                                    }}>キャンセル</button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              message.text && (
                                <p className={styles.messageText}>
                                  {renderMessageText(message.text, showToast)}
                                  {message.isEdited && (
                                    <span className={styles.editedLabel} title="このメッセージは編集されました">
                                      {/* L-3: 編集済みアイコン併用 */}
                                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 2, verticalAlign: 'middle' }} aria-hidden="true">
                                        <path d="M12 20h9" />
                                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                                      </svg>
                                      (編集済み)
                                    </span>
                                  )}
                                </p>
                              )
                            )}
                          </>
                        )}
                      </div>

                      {/* 楽観的更新の失敗時アクション（H-2） */}
                      {message._pending === 'failed' && (
                        <div className={styles.pendingActions}>
                          <button
                            type="button"
                            className={styles.retry}
                            onClick={(e) => {
                              e.stopPropagation();
                              retryFailedMessage(message);
                            }}
                          >
                            再送
                          </button>
                          <button
                            type="button"
                            className={styles.dismiss}
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissOptimistic(message.id);
                            }}
                          >
                            破棄
                          </button>
                        </div>
                      )}

                      {/* リアクション表示 */}
                      {getReactionEntries(message).length > 0 && (
                        <div className={styles.reactions}>
                          {getReactionEntries(message).map(([emoji, reactionUsers]) => {
                            const isMine = reactionUsers.includes(currentUser?.uid || '');
                            return (
                              <button
                                key={emoji}
                                className={`${styles.reactionBadge} ${isMine ? styles.myReaction : ''}`}
                                onClick={() => showReactionUsers(message.id, emoji, reactionUsers)}
                                onContextMenu={
                                  isMine
                                    ? (e) => {
                                        // M-6: 自分のリアクションは右クリックで直接取消
                                        e.preventDefault();
                                        void removeReaction(message.id, emoji);
                                      }
                                    : undefined
                                }
                                title={isMine ? '右クリックで取消' : '詳細を表示'}
                                aria-label={isMine ? `${emoji} のリアクションを取消 (${reactionUsers.length}人)` : `${emoji} のリアクション詳細 (${reactionUsers.length}人)`}
                              >
                                {emoji} {reactionUsers.length}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </MessageBubbleInteractive>

                    {message.senderId !== currentUser?.uid && (
                      <div className={styles.messageInfo}>
                        <span className={styles.messageTime}>{formatTime(message.createdAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Fragment>
          );
        })
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
