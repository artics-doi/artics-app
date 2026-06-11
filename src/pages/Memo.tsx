import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { compressImage, isImageFile } from '../utils/imageCompression';
import { MAX_FILE_SIZE } from '../constants';
import { getMemoColor, MEMO_COLORS } from '../constants/memoColors';
import type { MemoNote, CheckItem } from '../types/memo';
import { formatNoteDate, renderNoteText, sortNotes } from '../utils/memoUtils';
import MemoEditModal from '../components/memo/MemoEditModal';
import ConfirmModal from '../components/modals/ConfirmModal';
import styles from './Memo.module.css';

function getMemoReturnPath(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;

  const from = (state as { from?: unknown }).from;
  if (typeof from !== 'string') return null;
  if (!from.startsWith('/') || from === '/memo' || from.startsWith('/memo/')) return null;

  return from;
}

export default function Memo() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const { showToast } = useToast();

  const [notes, setNotes] = useState<MemoNote[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // コンポーザー
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [composerTitle, setComposerTitle] = useState('');
  const [composerBody, setComposerBody] = useState('');
  const [composerColorId, setComposerColorId] = useState<string | null>(null);
  const [composerNoteType, setComposerNoteType] = useState<'text' | 'checklist'>('text');
  const [composerCheckItems, setComposerCheckItems] = useState<CheckItem[]>([]);
  const [composerPinned, setComposerPinned] = useState(false);
  const [composerImageFile, setComposerImageFile] = useState<File | null>(null);
  const [composerImagePreview, setComposerImagePreview] = useState<string | null>(null);
  const [showComposerColors, setShowComposerColors] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);
  const composerFileInputRef = useRef<HTMLInputElement>(null);

  // 編集モーダル
  const [editingNote, setEditingNote] = useState<MemoNote | null>(null);

  // H-6: コンポーザー閉じ時の確認モーダル
  const [showComposerCloseConfirm, setShowComposerCloseConfirm] = useState(false);

  // M-23: メモ削除確認モーダル（confirm() の代替）
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(null);

  // M-24: カード画像アップロード中のメモ ID（spinner 表示用）
  const [imageUploadingNoteId, setImageUploadingNoteId] = useState<string | null>(null);

  // カードレベルのポップオーバー状態
  const [cardColorPopover, setCardColorPopover] = useState<string | null>(null);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const returnPath = getMemoReturnPath(location.state);

  function handleBack() {
    if (returnPath) {
      navigate(returnPath);
      return;
    }

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate('/schedule');
  }


  // メモをリアルタイム取得
  useEffect(() => {
    if (!roomId) return;
    const q = query(
      collection(db, 'chatRooms', roomId, 'messages'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const items: MemoNote[] = [];
      snap.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          title: data.title || '',
          text: data.text || '',
          imageURL: data.imageURL || null,
          storagePath: data.storagePath || null,
          fileSize: data.fileSize || null,
          isPinned: !!data.isPinned,
          colorId: data.colorId || null,
          noteType: data.noteType || 'text',
          checkItems: data.checkItems || [],
          orderIndex: data.orderIndex ?? null,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        });
      });
      setNotes(items);
    });
    return () => unsub();
  }, [roomId]);

  function resetComposer() {
    setComposerTitle('');
    setComposerBody('');
    setComposerColorId(null);
    setComposerPinned(false);
    setComposerNoteType('text');
    setComposerCheckItems([]);
    setComposerImageFile(null);
    setComposerImagePreview(null);
    setShowComposerColors(false);
    setComposerExpanded(false);
  }

  // H-6: 入力がメモとして保存に値する内容を持っているか判定
  function hasComposerContent(): boolean {
    if (composerTitle.trim()) return true;
    if (composerBody.trim()) return true;
    if (composerImageFile) return true;
    if (composerCheckItems.some((ci) => ci.text.trim())) return true;
    return false;
  }

  async function uploadImage(file: File): Promise<{ url: string; storagePath: string; fileSize: number }> {
    let uploadFile = file;
    if (isImageFile(file)) {
      uploadFile = await compressImage(file);
    }
    const timestamp = Date.now();
    const storagePath = `chatImages/${roomId}/${timestamp}/${file.name}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, uploadFile);
    const url = await getDownloadURL(storageRef);
    return { url, storagePath, fileSize: uploadFile.size };
  }

  async function saveComposer() {
    if (!roomId || !currentUser) {
      resetComposer();
      return;
    }
    const title = composerTitle.trim();
    const text = composerBody.trim();
    const filteredCheckItems = composerCheckItems.filter(ci => ci.text.trim());
    if (!title && !text && !composerImageFile && filteredCheckItems.length === 0) {
      resetComposer();
      return;
    }
    if (composerImageFile?.size && composerImageFile.size > MAX_FILE_SIZE) {
      showToast('warning', 'ファイルサイズが大きすぎます（最大30MB）');
      return;
    }

    try {
      const uploadedImage = composerImageFile ? await uploadImage(composerImageFile) : null;
      await addDoc(collection(db, 'chatRooms', roomId, 'messages'), {
        chatRoomId: roomId,
        title,
        text,
        imageURL: uploadedImage?.url ?? null,
        storagePath: uploadedImage?.storagePath ?? null,
        fileSize: uploadedImage?.fileSize ?? null,
        isPinned: composerPinned,
        colorId: composerColorId,
        noteType: composerNoteType,
        checkItems: composerNoteType === 'checklist' ? filteredCheckItems : [],
        senderId: currentUser.uid,
        senderName: currentUser.displayName || '',
        senderPhotoURL: currentUser.photoURL || null,
        readBy: [currentUser.uid],
        fileURL: null,
        fileName: null,
        fileType: null,
        isDeleted: false,
        reactions: {},
        reactionsByUser: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'chatRooms', roomId), { updatedAt: serverTimestamp() });
    } catch (err) {
      console.error('メモ作成エラー:', err);
      showToast('error', 'メモの作成に失敗しました');
    }
    resetComposer();
  }

  // H-6: コンポーザー外クリックで「変更あり→確認モーダル / 変更なし→そのままリセット」
  useEffect(() => {
    if (!composerExpanded) return;
    const handleClick = (e: MouseEvent) => {
      if (showComposerCloseConfirm) return; // 確認モーダル表示中は外クリックを無視
      if (!composerRef.current || composerRef.current.contains(e.target as Node)) return;
      if (hasComposerContent()) {
        setShowComposerCloseConfirm(true);
      } else {
        resetComposer();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerExpanded, showComposerCloseConfirm, composerTitle, composerBody, composerColorId, composerNoteType, composerCheckItems, composerImageFile, composerPinned]);

  // H-6: Esc キーでコンポーザーを閉じる（変更あり→確認、変更なし→即閉じる）
  useEffect(() => {
    if (!composerExpanded) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showComposerCloseConfirm) return;
      e.preventDefault();
      if (hasComposerContent()) {
        setShowComposerCloseConfirm(true);
      } else {
        resetComposer();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerExpanded, showComposerCloseConfirm, composerTitle, composerBody, composerColorId, composerNoteType, composerCheckItems, composerImageFile, composerPinned]);

  function handleComposerImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setComposerImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setComposerImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function updateNote(noteId: string, updates: { title: string; text: string; colorId: string | null; noteType: 'text' | 'checklist'; checkItems: CheckItem[] }) {
    if (!roomId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', roomId, 'messages', noteId), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('メモ更新エラー:', err);
      showToast('error', 'メモの更新に失敗しました');
    }
  }

  async function deleteNote(noteId: string) {
    if (!roomId) return;
    try {
      const note = notes.find((item) => item.id === noteId);
      if (note?.storagePath) {
        await deleteObject(ref(storage, note.storagePath)).catch((error) => {
          if (error?.code !== 'storage/object-not-found') throw error;
        });
      }
      await deleteDoc(doc(db, 'chatRooms', roomId, 'messages', noteId));
    } catch (err) {
      console.error('メモ削除エラー:', err);
      showToast('error', 'メモの削除に失敗しました');
    }
    setEditingNote(null);
  }

  async function togglePin(noteId: string, currentPinned: boolean) {
    if (!roomId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', roomId, 'messages', noteId), {
        isPinned: !currentPinned,
      });
    } catch (err) {
      console.error('ピン留めエラー:', err);
    }
  }

  async function handleImageUpload(noteId: string, file: File) {
    if (!roomId || !currentUser) return;
    if (file.size > MAX_FILE_SIZE) {
      showToast('warning', 'ファイルサイズが大きすぎます（最大30MB）');
      return;
    }
    // M-24: アップロード中 spinner 表示
    setImageUploadingNoteId(noteId);
    try {
      const previousNote = notes.find((note) => note.id === noteId);
      const uploadedImage = await uploadImage(file);
      await updateDoc(doc(db, 'chatRooms', roomId, 'messages', noteId), {
        imageURL: uploadedImage.url,
        storagePath: uploadedImage.storagePath,
        fileSize: uploadedImage.fileSize,
        updatedAt: serverTimestamp(),
      });
      if (previousNote?.storagePath && previousNote.storagePath !== uploadedImage.storagePath) {
        await deleteObject(ref(storage, previousNote.storagePath)).catch((error) => {
          if (error?.code !== 'storage/object-not-found') throw error;
        });
      }
    } catch (err) {
      console.error('画像アップロードエラー:', err);
      showToast('error', '画像のアップロードに失敗しました');
    } finally {
      setImageUploadingNoteId(null);
    }
  }

  // カードレベルでの色変更
  async function updateNoteColor(noteId: string, newColorId: string | null) {
    if (!roomId) return;
    try {
      await updateDoc(doc(db, 'chatRooms', roomId, 'messages', noteId), {
        colorId: newColorId,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('色変更エラー:', err);
    }
  }

  // カードレベルの画像アップロード用ref
  const cardFileInputRef = useRef<HTMLInputElement>(null);
  const [cardFileTarget, setCardFileTarget] = useState<string | null>(null);

  function handleCardFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && cardFileTarget) {
      handleImageUpload(cardFileTarget, file);
      setCardFileTarget(null);
    }
    e.target.value = '';
  }

  // フィルター（テキスト検索）
  const filteredNotes = useMemo(() => {
    let result = notes;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.text.toLowerCase().includes(q) ||
        n.checkItems.some(ci => ci.text.toLowerCase().includes(q))
      );
    }
    return result;
  }, [notes, searchQuery]);

  const sortedNotes = useMemo(() => sortNotes(filteredNotes), [filteredNotes]);

  const pinnedNotes = sortedNotes.filter(n => n.isPinned);
  const otherNotes = sortedNotes.filter(n => !n.isPinned);

  // ↑↓ボタンで並び替え
  async function moveNote(noteId: string, direction: 'up' | 'down', noteList: MemoNote[]) {
    if (!roomId) return;
    const idx = noteList.findIndex(n => n.id === noteId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= noteList.length) return;

    // 全アイテムにorderIndexを割り当て、対象2つを入れ替え
    const reordered = [...noteList];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];

    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].orderIndex !== i) {
        await updateDoc(doc(db, 'chatRooms', roomId, 'messages', reordered[i].id), { orderIndex: i });
      }
    }
  }

  function renderCard(note: MemoNote, noteList: MemoNote[]) {
    const bgColor = getMemoColor(note.colorId, isDark);
    const noteIdx = noteList.findIndex(n => n.id === note.id);
    return (
      <div
        key={note.id}
        className={styles.memoCard}
        style={bgColor ? { backgroundColor: bgColor } : undefined}
        onClick={() => {
          setCardColorPopover(null);
          setEditingNote(note);
        }}
      >
        {/* ↑↓並び替えボタン */}
        <div className={styles.cardMoveButtons}>
          <button
            className={styles.cardMoveBtn}
            disabled={noteIdx === 0}
            onClick={(e) => { e.stopPropagation(); moveNote(note.id, 'up', noteList); }}
            title="上に移動"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <button
            className={styles.cardMoveBtn}
            disabled={noteIdx === noteList.length - 1}
            onClick={(e) => { e.stopPropagation(); moveNote(note.id, 'down', noteList); }}
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
          onClick={(e) => { e.stopPropagation(); togglePin(note.id, note.isPinned); }}
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
              setCardFileTarget(note.id);
              cardFileInputRef.current?.click();
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
              setPendingDeleteNoteId(note.id);
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
                    updateNoteColor(note.id, c.id === 'default' ? null : c.id);
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

  const composerBgColor = getMemoColor(composerColorId, isDark);

  return (
    <div className={styles.memoRoot}>
      {/* ヘッダー */}
      <header className={styles.memoHeader}>
        <button className={styles.backButton} onClick={handleBack} title="戻る">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className={styles.memoHeaderTitle}>メモ</span>
      </header>

      {/* 検索バー */}
      <div className={styles.searchBar}>
        <div className={styles.searchBarInner}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text-tertiary)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="メモを検索..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className={styles.searchClear} onClick={() => setSearchQuery('')} title="クリア">
              &times;
            </button>
          )}
        </div>
      </div>

      {/* コンポーザー */}
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
              <button className={styles.composerCloseBtn} onClick={() => saveComposer()}>閉じる</button>
            </div>
            <input
              ref={composerFileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleComposerImageSelect}
            />
          </div>
        )}
      </div>

      {/* メモ一覧 */}
      <div className={styles.memoBody}>
        {filteredNotes.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            {notes.length === 0 ? (
              <>
                <div className={styles.emptyText}>メモを作成しましょう</div>
                <div className={styles.emptySubtext}>上の入力欄からメモを作成できます</div>
              </>
            ) : searchQuery.trim() ? (
              <>
                <div className={styles.emptyText}>「{searchQuery}」に一致するメモはありません</div>
                <div className={styles.emptySubtext}>別のキーワードで検索してみてください</div>
              </>
            ) : (
              <>
                <div className={styles.emptyText}>まだメモがありません</div>
                <div className={styles.emptySubtext}>上の入力欄からメモを作成しましょう</div>
              </>
            )}
          </div>
        )}

        {pinnedNotes.length > 0 && (
          <div className={styles.sectionBlock}>
            <div className={styles.sectionHeader}>固定済み</div>
            <div className={styles.memoGrid}>
              {pinnedNotes.map(n => renderCard(n, pinnedNotes))}
            </div>
          </div>
        )}

        {pinnedNotes.length > 0 && otherNotes.length > 0 && (
          <hr className={styles.sectionDivider} />
        )}

        {otherNotes.length > 0 && (
          <div className={styles.sectionBlock}>
            {pinnedNotes.length > 0 && <div className={styles.sectionHeader}>その他</div>}
            <div className={styles.memoGrid}>
              {otherNotes.map(n => renderCard(n, otherNotes))}
            </div>
          </div>
        )}
      </div>

      {/* 編集モーダル (閉じる = 自動保存) */}
      {editingNote && (
        <MemoEditModal
          note={editingNote}
          onSave={(updates) => {
            updateNote(editingNote.id, updates);
            setEditingNote(null);
          }}
          onDelete={() => deleteNote(editingNote.id)}
          onTogglePin={() => {
            togglePin(editingNote.id, editingNote.isPinned);
            setEditingNote({ ...editingNote, isPinned: !editingNote.isPinned });
          }}
          onImageUpload={(file) => handleImageUpload(editingNote.id, file)}
        />
      )}

      {/* カードレベル画像アップロード用 hidden input */}
      <input
        ref={cardFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleCardFileChange}
      />

      {/* H-6: コンポーザー閉じ確認モーダル */}
      {showComposerCloseConfirm && (
        <ConfirmModal
          title="メモを保存しますか？"
          message="メモの内容が未保存です。保存して閉じる、または変更を破棄できます。"
          confirmText="保存して閉じる"
          cancelText="破棄"
          onConfirm={() => {
            setShowComposerCloseConfirm(false);
            saveComposer();
          }}
          onCancel={() => {
            setShowComposerCloseConfirm(false);
            resetComposer();
          }}
        />
      )}

      {/* M-23: メモ削除確認モーダル */}
      {pendingDeleteNoteId && (
        <ConfirmModal
          title="メモを削除しますか？"
          message="このメモを完全に削除します。元に戻せません。"
          confirmText="削除"
          cancelText="キャンセル"
          isDestructive
          onConfirm={() => {
            deleteNote(pendingDeleteNoteId);
            setPendingDeleteNoteId(null);
          }}
          onCancel={() => setPendingDeleteNoteId(null)}
        />
      )}
    </div>
  );
}
