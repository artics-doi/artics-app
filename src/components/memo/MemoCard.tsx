// メモカード1枚分の表示。Memo.tsx の renderCard から機械的に移動（挙動変更なし）。
// スタイルは親ページの Memo.module.css をそのまま使う。状態は親が保持し、props で受け取る。

import { getMemoColor, MEMO_COLORS } from '../../constants/memoColors';
import type { MemoNote } from '../../types/memo';
import { formatNoteDate, renderNoteText } from '../../utils/memoUtils';
import styles from '../../pages/Memo.module.css';

interface MemoCardProps {
  note: MemoNote;
  noteList: MemoNote[];
  isDark: boolean;
  imageUploadingNoteId: string | null;
  cardColorPopover: string | null;
  setCardColorPopover: (noteId: string | null) => void;
  onEdit: (note: MemoNote) => void;
  onMove: (noteId: string, direction: 'up' | 'down', noteList: MemoNote[]) => void;
  onTogglePin: (noteId: string, isPinned: boolean) => void;
  onRequestDelete: (noteId: string) => void;
  onAddImage: (noteId: string) => void;
  onColorChange: (noteId: string, colorId: string | null) => void;
}

export default function MemoCard({
  note,
  noteList,
  isDark,
  imageUploadingNoteId,
  cardColorPopover,
  setCardColorPopover,
  onEdit,
  onMove,
  onTogglePin,
  onRequestDelete,
  onAddImage,
  onColorChange,
}: MemoCardProps) {
  const bgColor = getMemoColor(note.colorId, isDark);
  const noteIdx = noteList.findIndex(n => n.id === note.id);
  return (
    <div
      className={styles.memoCard}
      style={bgColor ? { backgroundColor: bgColor } : undefined}
      onClick={() => {
        setCardColorPopover(null);
        onEdit(note);
      }}
    >
      {/* ↑↓並び替えボタン */}
      <div className={styles.cardMoveButtons}>
        <button
          className={styles.cardMoveBtn}
          disabled={noteIdx === 0}
          onClick={(e) => { e.stopPropagation(); onMove(note.id, 'up', noteList); }}
          title="上に移動"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          className={styles.cardMoveBtn}
          disabled={noteIdx === noteList.length - 1}
          onClick={(e) => { e.stopPropagation(); onMove(note.id, 'down', noteList); }}
          title="下に移動"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* 左下ピンボタン */}
      <button
        className={`${styles.cardHoverPin} ${note.isPinned ? styles.cardHoverPinActive : ''}`}
        onClick={(e) => { e.stopPropagation(); onTogglePin(note.id, note.isPinned); }}
        title={note.isPinned ? '固定を解除' : 'メモを固定'}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill={note.isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
          <path d="M12 2L12 12" />
          <path d="M18 8L18 12C18 14 16 16 12 16C8 16 6 14 6 12L6 8" />
          <path d="M12 16V22" />
          <path d="M8 22H16" />
        </svg>
      </button>

      {(note.imageURL || imageUploadingNoteId === note.id) && (
        <div className={styles.cardImageWrapper}>
          {note.imageURL && (
            <img className={styles.cardImage} src={note.imageURL} alt="" />
          )}
          {/* M-24: 画像アップロード中の spinner overlay */}
          {imageUploadingNoteId === note.id && (
            <div className={styles.cardImageUploading} aria-live="polite">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              アップロード中...
            </div>
          )}
        </div>
      )}
      <div className={styles.cardContent}>
        {note.title && <div className={styles.cardTitle}>{note.title}</div>}
        {note.noteType === 'checklist' && note.checkItems.length > 0 ? (
          <>
            <div className={styles.cardChecklist}>
              {note.checkItems.map(ci => (
                <div key={ci.id} className={styles.cardCheckItem}>
                  <input type="checkbox" checked={ci.checked} readOnly />
                  <span className={ci.checked ? styles.cardCheckItemChecked : ''}>{ci.text}</span>
                </div>
              ))}
            </div>
            <div className={styles.cardCheckProgress}>
              {note.checkItems.filter(ci => ci.checked).length}/{note.checkItems.length}完了
            </div>
          </>
        ) : (
          note.text && <div className={styles.cardBody}>{renderNoteText(note.text, styles.memoLink)}</div>
        )}
      </div>
      <div className={styles.cardFooter}>
        {note.isPinned && (
          <svg className={styles.cardPinIndicator} viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="currentColor" strokeWidth="1">
            <path d="M12 2L12 12" />
          <path d="M18 8L18 12C18 14 16 16 12 16C8 16 6 14 6 12L6 8" />
          <path d="M12 16V22" />
          <path d="M8 22H16" />
          </svg>
        )}
        <span className={styles.cardDate}>{formatNoteDate(note.updatedAt)}</span>
      </div>

      {/* Google Keep風: ホバー時の下部アクションバー */}
      <div className={styles.cardHoverActions}>
        {/* 背景色ボタン */}
        <button
          className={styles.cardHoverBtn}
          onClick={(e) => {
            e.stopPropagation();
            setCardColorPopover(cardColorPopover === note.id ? null : note.id);
          }}
          title="背景色"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
          </svg>
        </button>
        {/* 画像ボタン */}
        <button
          className={styles.cardHoverBtn}
          onClick={(e) => {
            e.stopPropagation();
            onAddImage(note.id);
          }}
          title="画像を追加"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>
        {/* 削除ボタン（M-23: confirm() を ConfirmModal で統一） */}
        <button
          className={`${styles.cardHoverBtn} ${styles.cardHoverBtnDanger}`}
          onClick={(e) => {
            e.stopPropagation();
            onRequestDelete(note.id);
          }}
          title="削除"
          aria-label="メモを削除"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      {/* 色ポップオーバー */}
      {cardColorPopover === note.id && (
        <div className={styles.cardColorPopover} onClick={(e) => e.stopPropagation()}>
          {MEMO_COLORS.map(c => {
            const swatchColor = isDark ? c.dark : c.light;
            return (
              <button
                key={c.id}
                className={`${styles.colorSwatch} ${note.colorId === c.id || (!note.colorId && c.id === 'default') ? styles.colorSwatchActive : ''}`}
                style={c.id !== 'default' ? { backgroundColor: swatchColor } : undefined}
                onClick={() => {
                  onColorChange(note.id, c.id === 'default' ? null : c.id);
                  setCardColorPopover(null);
                }}
                title={c.name}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
