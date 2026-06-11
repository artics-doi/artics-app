// メモ作成コンポーザー（折りたたみ/展開）。Memo.tsx から機械的に移動（挙動変更なし）。
// スタイルは親ページの Memo.module.css をそのまま使う。状態と ref は親が保持し、props で受け取る
// （外側クリック・Esc の検出 effect が親にあり composerRef を参照するため）。

import type { Dispatch, RefObject, SetStateAction, ChangeEvent } from 'react';
import { MEMO_COLORS } from '../../constants/memoColors';
import type { CheckItem } from '../../types/memo';
import styles from '../../pages/Memo.module.css';

interface MemoComposerProps {
  composerExpanded: boolean;
  setComposerExpanded: Dispatch<SetStateAction<boolean>>;
  composerTitle: string;
  setComposerTitle: Dispatch<SetStateAction<string>>;
  composerBody: string;
  setComposerBody: Dispatch<SetStateAction<string>>;
  composerColorId: string | null;
  setComposerColorId: Dispatch<SetStateAction<string | null>>;
  composerNoteType: 'text' | 'checklist';
  setComposerNoteType: Dispatch<SetStateAction<'text' | 'checklist'>>;
  composerCheckItems: CheckItem[];
  setComposerCheckItems: Dispatch<SetStateAction<CheckItem[]>>;
  composerPinned: boolean;
  setComposerPinned: Dispatch<SetStateAction<boolean>>;
  composerImagePreview: string | null;
  setComposerImageFile: Dispatch<SetStateAction<File | null>>;
  setComposerImagePreview: Dispatch<SetStateAction<string | null>>;
  showComposerColors: boolean;
  setShowComposerColors: Dispatch<SetStateAction<boolean>>;
  isDark: boolean;
  composerBgColor: string | undefined;
  composerRef: RefObject<HTMLDivElement | null>;
  composerFileInputRef: RefObject<HTMLInputElement | null>;
  onSave: () => void;
  onImageSelect: (e: ChangeEvent<HTMLInputElement>) => void;
}

export default function MemoComposer({
  composerExpanded,
  setComposerExpanded,
  composerTitle,
  setComposerTitle,
  composerBody,
  setComposerBody,
  composerColorId,
  setComposerColorId,
  composerNoteType,
  setComposerNoteType,
  composerCheckItems,
  setComposerCheckItems,
  composerPinned,
  setComposerPinned,
  composerImagePreview,
  setComposerImageFile,
  setComposerImagePreview,
  showComposerColors,
  setShowComposerColors,
  isDark,
  composerBgColor,
  composerRef,
  composerFileInputRef,
  onSave,
  onImageSelect,
}: MemoComposerProps) {
  return (
    <div className={styles.composerWrapper}>
      {!composerExpanded ? (
        <div className={styles.composerCollapsed} onClick={() => setComposerExpanded(true)}>
          <span className={styles.composerCollapsedText}>メモを入力...</span>
          <div className={styles.composerCollapsedActions}>
            <button
              className={styles.composerCollapsedBtn}
              onClick={(e) => { e.stopPropagation(); setComposerExpanded(true); composerFileInputRef.current?.click(); }}
              title="画像付きメモ"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </button>
            <button
              className={styles.composerCollapsedBtn}
              onClick={(e) => {
                e.stopPropagation();
                setComposerExpanded(true);
                setComposerNoteType('checklist');
                setComposerCheckItems([{ id: crypto.randomUUID(), text: '', checked: false }]);
              }}
              title="チェックリスト"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" />
                <rect x="3" y="11" width="4" height="4" rx="1" />
                <rect x="3" y="3" width="4" height="4" rx="1" />
                <line x1="11" y1="5" x2="22" y2="5" />
                <rect x="3" y="19" width="4" height="4" rx="1" />
                <line x1="11" y1="21" x2="22" y2="21" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={composerRef}
          className={styles.composerExpanded}
          style={composerBgColor ? { backgroundColor: composerBgColor } : undefined}
        >
          <input
            className={styles.composerTitleInput}
            type="text"
            placeholder="タイトル"
            value={composerTitle}
            onChange={e => setComposerTitle(e.target.value)}
          />
          {composerNoteType === 'checklist' ? (
            <div className={styles.composerCheckList}>
              {composerCheckItems.map((item, idx) => (
                <div key={item.id} className={styles.composerCheckItem}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => {
                      const updated = [...composerCheckItems];
                      updated[idx] = { ...item, checked: !item.checked };
                      setComposerCheckItems(updated);
                    }}
                  />
                  <input
                    className={styles.composerCheckItemInput}
                    type="text"
                    value={item.text}
                    placeholder="リスト アイテム"
                    onChange={e => {
                      const updated = [...composerCheckItems];
                      updated[idx] = { ...item, text: e.target.value };
                      setComposerCheckItems(updated);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const newItem: CheckItem = { id: crypto.randomUUID(), text: '', checked: false };
                        const updated = [...composerCheckItems];
                        updated.splice(idx + 1, 0, newItem);
                        setComposerCheckItems(updated);
                      } else if (e.key === 'Backspace' && item.text === '' && composerCheckItems.length > 1) {
                        e.preventDefault();
                        setComposerCheckItems(composerCheckItems.filter((_, i) => i !== idx));
                      }
                    }}
                  />
                  {composerCheckItems.length > 1 && (
                    <button
                      className={styles.composerCheckItemDelete}
                      onClick={() => setComposerCheckItems(composerCheckItems.filter((_, i) => i !== idx))}
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
              <button
                className={styles.composerCheckAddBtn}
                onClick={() => setComposerCheckItems([...composerCheckItems, { id: crypto.randomUUID(), text: '', checked: false }])}
              >
                + アイテムを追加
              </button>
            </div>
          ) : (
            <textarea
              className={styles.composerTextarea}
              placeholder="メモを入力..."
              value={composerBody}
              onChange={e => setComposerBody(e.target.value)}
              rows={3}
            />
          )}
          {composerImagePreview && (
            <div className={styles.composerImagePreview}>
              <img src={composerImagePreview} alt="" />
              <button
                className={styles.composerImageRemove}
                onClick={() => { setComposerImageFile(null); setComposerImagePreview(null); }}
                title="画像を削除"
              >&times;</button>
            </div>
          )}
          {showComposerColors && (
            <div className={styles.composerColorPalette}>
              {MEMO_COLORS.map(c => {
                const swatchColor = isDark ? c.dark : c.light;
                return (
                  <button
                    key={c.id}
                    className={`${styles.colorSwatch} ${composerColorId === c.id || (!composerColorId && c.id === 'default') ? styles.colorSwatchActive : ''}`}
                    style={c.id !== 'default' ? { backgroundColor: swatchColor } : undefined}
                    onClick={() => setComposerColorId(c.id === 'default' ? null : c.id)}
                    title={c.name}
                  />
                );
              })}
            </div>
          )}
          <div className={styles.composerActions}>
            <div className={styles.composerActionsLeft}>
              <button
                className={`${styles.composerActionBtn} ${composerPinned ? styles.composerActionBtnActive : ''}`}
                onClick={() => setComposerPinned(!composerPinned)}
                title={composerPinned ? '固定を解除' : 'メモを固定'}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill={composerPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L12 12" />
                  <path d="M18 8L18 12C18 14 16 16 12 16C8 16 6 14 6 12L6 8" />
                  <path d="M12 16V22" />
                  <path d="M8 22H16" />
                </svg>
              </button>
              <button
                className={styles.composerActionBtn}
                onClick={() => setShowComposerColors(!showComposerColors)}
                title="背景色"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                </svg>
              </button>
              <button
                className={styles.composerActionBtn}
                onClick={() => composerFileInputRef.current?.click()}
                title="画像を添付"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>
            </div>
            <button className={styles.composerCloseBtn} onClick={() => onSave()}>閉じる</button>
          </div>
          <input
            ref={composerFileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={onImageSelect}
          />
        </div>
      )}
    </div>
  );
}
