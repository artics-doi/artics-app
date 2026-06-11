import { useState, useEffect, useRef, useCallback } from 'react';
import type { MemoNote, CheckItem } from '../../types/memo';
import { MEMO_COLORS, getMemoColor } from '../../constants/memoColors';
import useModal from '../../hooks/useModal';
import styles from '../../pages/Memo.module.css';

interface Props {
  note: MemoNote;
  onSave: (updates: { title: string; text: string; colorId: string | null; noteType: 'text' | 'checklist'; checkItems: CheckItem[] }) => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onImageUpload: (file: File) => void;
}

export default function MemoEditModal({ note, onSave, onDelete, onTogglePin, onImageUpload }: Props) {
  const [title, setTitle] = useState(note.title);
  const [text, setText] = useState(note.text);
  const [colorId, setColorId] = useState<string | null>(note.colorId);
  const [noteType, setNoteType] = useState<'text' | 'checklist'>(note.noteType);
  const [checkItems, setCheckItems] = useState<CheckItem[]>(note.checkItems);
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  // 別のメモを選択した際に編集 state を最新の note 値で初期化する。
  // 意図的に note.id のみを依存にして、他フィールドの変更（onSave 後の即時反映等）では
  // ローカル編集状態を上書きしないようにしている。
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    setTitle(note.title);
    setText(note.text);
    setColorId(note.colorId);
    setNoteType(note.noteType);
    setCheckItems(note.checkItems);
    setShowColorPalette(false);
    setShowDeleteConfirm(false);
    setShowMoreMenu(false);
  }, [note.id]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  // Google Keep方式: 閉じる = 自動保存
  const saveAndClose = useCallback(() => {
    onSave({ title, text, colorId, noteType, checkItems: noteType === 'checklist' ? checkItems.filter(ci => ci.text.trim()) : [] });
  }, [title, text, colorId, noteType, checkItems, onSave]);

  // M-5: Esc キーで保存して閉じる（useModal 経由）
  const { modalProps } = useModal({ isOpen: true, onClose: saveAndClose });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageUpload(file);
      e.target.value = '';
    }
  };

  const bgColor = getMemoColor(colorId, isDark);

  return (
    <div {...modalProps} className={styles.modalOverlay} onClick={saveAndClose}>
      <div className={styles.modalCard} style={bgColor ? { backgroundColor: bgColor } : undefined} onClick={e => e.stopPropagation()}>
        <div className={styles.modalContent}>
          <input
            className={styles.modalTitleInput}
            type="text"
            placeholder="タイトル"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          {noteType === 'checklist' ? (
            <div className={styles.modalCheckList}>
              {checkItems.map((item, idx) => (
                <div key={item.id} className={styles.modalCheckItem}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => {
                      const updated = [...checkItems];
                      updated[idx] = { ...item, checked: !item.checked };
                      setCheckItems(updated);
                    }}
                  />
                  <input
                    className={`${styles.modalCheckItemInput} ${item.checked ? styles.modalCheckItemChecked : ''}`}
                    type="text"
                    value={item.text}
                    placeholder="リスト アイテム"
                    onChange={e => {
                      const updated = [...checkItems];
                      updated[idx] = { ...item, text: e.target.value };
                      setCheckItems(updated);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const newItem: CheckItem = { id: crypto.randomUUID(), text: '', checked: false };
                        const updated = [...checkItems];
                        updated.splice(idx + 1, 0, newItem);
                        setCheckItems(updated);
                        setTimeout(() => {
                          const inputs = document.querySelectorAll(`.${styles.modalCheckItemInput}`);
                          (inputs[idx + 1] as HTMLInputElement)?.focus();
                        }, 0);
                      } else if (e.key === 'Backspace' && item.text === '' && checkItems.length > 1) {
                        e.preventDefault();
                        const updated = checkItems.filter((_, i) => i !== idx);
                        setCheckItems(updated);
                        setTimeout(() => {
                          const inputs = document.querySelectorAll(`.${styles.modalCheckItemInput}`);
                          const focusIdx = Math.max(0, idx - 1);
                          (inputs[focusIdx] as HTMLInputElement)?.focus();
                        }, 0);
                      }
                    }}
                  />
                  <button
                    className={styles.modalCheckItemDelete}
                    onClick={() => setCheckItems(checkItems.filter((_, i) => i !== idx))}
                    title="削除"
                  >
                    &times;
                  </button>
                </div>
              ))}
              <button
                className={styles.modalCheckAddBtn}
                onClick={() => setCheckItems([...checkItems, { id: crypto.randomUUID(), text: '', checked: false }])}
              >
                + アイテムを追加
              </button>
            </div>
          ) : (
            <textarea
              className={styles.modalTextarea}
              placeholder="メモを入力..."
              value={text}
              onChange={e => setText(e.target.value)}
              rows={8}
            />
          )}

          {note.imageURL && (
            <div className={styles.modalImagePreview}>
              <img src={note.imageURL} alt="" />
            </div>
          )}
        </div>

        {/* 色パレット */}
        {showColorPalette && (
          <div className={styles.colorPalette}>
            {MEMO_COLORS.map(c => {
              const swatchColor = isDark ? c.dark : c.light;
              return (
                <button
                  key={c.id}
                  className={`${styles.colorSwatch} ${colorId === c.id || (!colorId && c.id === 'default') ? styles.colorSwatchActive : ''}`}
                  style={c.id !== 'default' ? { backgroundColor: swatchColor } : undefined}
                  onClick={() => setColorId(c.id === 'default' ? null : c.id)}
                  title={c.name}
                />
              );
            })}
          </div>
        )}

        {/* 削除確認 */}
        {showDeleteConfirm && (
          <div className={styles.deleteConfirmBar}>
            <span>このメモを削除しますか？</span>
            <button className={styles.deleteConfirmYes} onClick={onDelete}>削除</button>
            <button className={styles.deleteConfirmNo} onClick={() => setShowDeleteConfirm(false)}>キャンセル</button>
          </div>
        )}

        {/* アクションバー (Google Keep風: アイコンのみ + 右端に閉じる) */}
        <div className={styles.modalActions}>
          <div className={styles.modalActionsLeft}>
            <button
              className={`${styles.modalActionBtn} ${note.isPinned ? styles.modalActionBtnActive : ''}`}
              onClick={onTogglePin}
              title={note.isPinned ? '固定を解除' : 'メモを固定'}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill={note.isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M12 2L12 12" />
                <path d="M18 8L18 12C18 14 16 16 12 16C8 16 6 14 6 12L6 8" />
                <path d="M12 16V22" />
                <path d="M8 22H16" />
              </svg>
            </button>
            <button
              className={`${styles.modalActionBtn} ${showColorPalette ? styles.modalActionBtnActive : ''}`}
              onClick={() => setShowColorPalette(!showColorPalette)}
              title="背景色を変更"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
              </svg>
            </button>
            <button
              className={styles.modalActionBtn}
              onClick={() => fileInputRef.current?.click()}
              title="画像を追加"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </button>
            <div className={styles.moreMenuWrapper}>
              <button
                className={`${styles.modalActionBtn} ${showMoreMenu ? styles.modalActionBtnActive : ''}`}
                onClick={() => { setShowMoreMenu(!showMoreMenu); setShowColorPalette(false); }}
                title="その他"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </button>
              {showMoreMenu && (
                <div className={styles.moreMenuPopover}>
                  <button
                    className={`${styles.moreMenuItem} ${styles.moreMenuItemDanger}`}
                    onClick={() => { setShowMoreMenu(false); setShowDeleteConfirm(true); }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    削除
                  </button>
                </div>
              )}
            </div>
          </div>
          <button className={styles.modalCloseBtn} onClick={saveAndClose}>閉じる</button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
