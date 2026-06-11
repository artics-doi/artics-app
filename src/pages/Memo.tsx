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
import { getMemoColor } from '../constants/memoColors';
import type { MemoNote, CheckItem } from '../types/memo';
import { sortNotes } from '../utils/memoUtils';
import MemoCard from '../components/memo/MemoCard';
import MemoComposer from '../components/memo/MemoComposer';
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

  // カード1枚分の描画。本体は components/memo/MemoCard.tsx（props の束ねだけここで行う）
  function renderCard(note: MemoNote, noteList: MemoNote[]) {
    return (
      <MemoCard
        key={note.id}
        note={note}
        noteList={noteList}
        isDark={isDark}
        imageUploadingNoteId={imageUploadingNoteId}
        cardColorPopover={cardColorPopover}
        setCardColorPopover={setCardColorPopover}
        onEdit={setEditingNote}
        onMove={moveNote}
        onTogglePin={togglePin}
        onRequestDelete={setPendingDeleteNoteId}
        onAddImage={(noteId) => {
          setCardFileTarget(noteId);
          cardFileInputRef.current?.click();
        }}
        onColorChange={updateNoteColor}
      />
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

      {/* コンポーザー（本体は components/memo/MemoComposer.tsx） */}
      <MemoComposer
        composerExpanded={composerExpanded}
        setComposerExpanded={setComposerExpanded}
        composerTitle={composerTitle}
        setComposerTitle={setComposerTitle}
        composerBody={composerBody}
        setComposerBody={setComposerBody}
        composerColorId={composerColorId}
        setComposerColorId={setComposerColorId}
        composerNoteType={composerNoteType}
        setComposerNoteType={setComposerNoteType}
        composerCheckItems={composerCheckItems}
        setComposerCheckItems={setComposerCheckItems}
        composerPinned={composerPinned}
        setComposerPinned={setComposerPinned}
        composerImagePreview={composerImagePreview}
        setComposerImageFile={setComposerImageFile}
        setComposerImagePreview={setComposerImagePreview}
        showComposerColors={showComposerColors}
        setShowComposerColors={setShowComposerColors}
        isDark={isDark}
        composerBgColor={composerBgColor}
        composerRef={composerRef}
        composerFileInputRef={composerFileInputRef}
        onSave={saveComposer}
        onImageSelect={handleComposerImageSelect}
      />

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
