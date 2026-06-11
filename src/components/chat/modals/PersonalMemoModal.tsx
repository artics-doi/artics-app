import { useEffect, useMemo, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useNavigate } from 'react-router-dom';
import MemoEditModal from '../../memo/MemoEditModal';
import useModal from '../../../hooks/useModal';
import { useToast } from '../../../contexts/ToastContext';
import { db, storage } from '../../../lib/firebase';
import { compressImage, isImageFile } from '../../../utils/imageCompression';
import { MAX_FILE_SIZE } from '../../../constants';
import { formatNoteDate, renderNoteText, sortNotes } from '../../../utils/memoUtils';
import type { CheckItem, MemoNote } from '../../../types/memo';
import styles from './PersonalMemoModal.module.css';

interface PersonalMemoModalProps {
  currentUser: FirebaseUser | null;
  onClose: () => void;
}

export default function PersonalMemoModal({ currentUser, onClose }: PersonalMemoModalProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { modalProps } = useModal({ isOpen: true, onClose });
  const [memoRoomId, setMemoRoomId] = useState<string | null>(null);
  const [notes, setNotes] = useState<MemoNote[]>([]);
  const [isLoadingRoom, setIsLoadingRoom] = useState(true);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [editingNote, setEditingNote] = useState<MemoNote | null>(null);
  const [composerTitle, setComposerTitle] = useState('');
  const [composerText, setComposerText] = useState('');
  const [creatingNote, setCreatingNote] = useState(false);


  useEffect(() => {
    let isCancelled = false;

    async function loadMemoRoom() {
      if (!currentUser) {
        setMemoRoomId(null);
        setIsLoadingRoom(false);
        return;
      }

      setIsLoadingRoom(true);
      try {
        const roomSnapshot = await getDocs(
          query(collection(db, 'chatRooms'), where('members', 'array-contains', currentUser.uid))
        );

        const memoRoom = roomSnapshot.docs.find((roomDoc) => roomDoc.data().type === 'memo');
        if (!isCancelled) {
          setMemoRoomId(memoRoom?.id ?? null);
        }
      } catch (error) {
        console.error('個人メモルーム取得エラー:', error);
        if (!isCancelled) {
          setMemoRoomId(null);
          showToast('error', '個人メモの読み込みに失敗しました');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingRoom(false);
        }
      }
    }

    void loadMemoRoom();

    return () => {
      isCancelled = true;
    };
  }, [currentUser, showToast]);

  useEffect(() => {
    if (!memoRoomId) {
      setNotes([]);
      setIsLoadingNotes(false);
      return;
    }

    setIsLoadingNotes(true);
    const notesQuery = query(
      collection(db, 'chatRooms', memoRoomId, 'messages'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      notesQuery,
      (snapshot) => {
        const items: MemoNote[] = [];
        snapshot.forEach((noteDoc) => {
          const data = noteDoc.data();
          items.push({
            id: noteDoc.id,
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
        setIsLoadingNotes(false);
      },
      (error) => {
        console.error('個人メモ一覧取得エラー:', error);
        setIsLoadingNotes(false);
        showToast('error', 'メモ一覧の読み込みに失敗しました');
      }
    );

    return () => unsubscribe();
  }, [memoRoomId, showToast]);

  useEffect(() => {
    if (!editingNote) return;

    const syncedNote = notes.find((note) => note.id === editingNote.id);
    if (!syncedNote) {
      setEditingNote(null);
      return;
    }

    if (syncedNote !== editingNote) {
      setEditingNote(syncedNote);
    }
  }, [notes, editingNote]);

  const sortedNotes = useMemo(() => sortNotes(notes), [notes]);

  const pinnedNotes = useMemo(
    () => sortedNotes.filter((note) => note.isPinned),
    [sortedNotes]
  );
  const otherNotes = useMemo(
    () => sortedNotes.filter((note) => !note.isPinned),
    [sortedNotes]
  );

  async function uploadImage(file: File): Promise<{ url: string; storagePath: string; fileSize: number }> {
    if (!memoRoomId) {
      throw new Error('メモルームがありません');
    }

    let uploadFile = file;
    if (isImageFile(file)) {
      uploadFile = await compressImage(file);
    }

    const timestamp = Date.now();
    const storagePath = `chatImages/${memoRoomId}/${timestamp}/${file.name}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, uploadFile);
    const url = await getDownloadURL(storageRef);
    return { url, storagePath, fileSize: uploadFile.size };
  }

  async function handleCreateNote() {
    if (!memoRoomId || !currentUser || creatingNote) return;

    const title = composerTitle.trim();
    const text = composerText.trim();
    if (!title && !text) return;

    setCreatingNote(true);
    try {
      await addDoc(collection(db, 'chatRooms', memoRoomId, 'messages'), {
        chatRoomId: memoRoomId,
        title,
        text,
        imageURL: null,
        storagePath: null,
        fileSize: null,
        isPinned: false,
        colorId: null,
        noteType: 'text',
        checkItems: [],
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

      await updateDoc(doc(db, 'chatRooms', memoRoomId), {
        updatedAt: serverTimestamp(),
      });

      setComposerTitle('');
      setComposerText('');
    } catch (error) {
      console.error('個人メモ作成エラー:', error);
      showToast('error', 'メモの作成に失敗しました');
    } finally {
      setCreatingNote(false);
    }
  }

  async function updateNote(
    noteId: string,
    updates: {
      title: string;
      text: string;
      colorId: string | null;
      noteType: 'text' | 'checklist';
      checkItems: CheckItem[];
    }
  ) {
    if (!memoRoomId) return;

    try {
      await updateDoc(doc(db, 'chatRooms', memoRoomId, 'messages', noteId), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('個人メモ更新エラー:', error);
      showToast('error', 'メモの更新に失敗しました');
    }
  }

  async function deleteNote(noteId: string) {
    if (!memoRoomId) return;

    try {
      const note = notes.find((item) => item.id === noteId);
      if (note?.storagePath) {
        await deleteObject(ref(storage, note.storagePath)).catch((error) => {
          if (error?.code !== 'storage/object-not-found') throw error;
        });
      }
      await deleteDoc(doc(db, 'chatRooms', memoRoomId, 'messages', noteId));
    } catch (error) {
      console.error('個人メモ削除エラー:', error);
      showToast('error', 'メモの削除に失敗しました');
    }

    setEditingNote(null);
  }

  async function togglePin(noteId: string, currentPinned: boolean) {
    if (!memoRoomId) return;

    try {
      await updateDoc(doc(db, 'chatRooms', memoRoomId, 'messages', noteId), {
        isPinned: !currentPinned,
        updatedAt: serverTimestamp(),
      });

      setEditingNote((current) => (
        current && current.id === noteId
          ? { ...current, isPinned: !currentPinned, updatedAt: new Date() }
          : current
      ));
    } catch (error) {
      console.error('個人メモ固定エラー:', error);
      showToast('error', 'メモの固定切り替えに失敗しました');
    }
  }

  async function handleImageUpload(noteId: string, file: File) {
    if (!memoRoomId || !currentUser) return;
    if (file.size > MAX_FILE_SIZE) {
      showToast('warning', 'ファイルサイズが大きすぎます（最大30MB）');
      return;
    }

    try {
      const previousNote = notes.find((note) => note.id === noteId);
      const uploadedImage = await uploadImage(file);
      await updateDoc(doc(db, 'chatRooms', memoRoomId, 'messages', noteId), {
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

      setEditingNote((current) => (
        current && current.id === noteId
          ? {
              ...current,
              imageURL: uploadedImage.url,
              storagePath: uploadedImage.storagePath,
              fileSize: uploadedImage.fileSize,
              updatedAt: new Date(),
            }
          : current
      ));
    } catch (error) {
      console.error('個人メモ画像アップロードエラー:', error);
      showToast('error', '画像のアップロードに失敗しました');
    }
  }

  function handleOpenMemoPage() {
    if (!memoRoomId) return;
    onClose();
    navigate(`/memo/${memoRoomId}`);
  }

  function renderCard(note: MemoNote) {
    return (
      <div
        key={note.id}
        className={styles.memoCard}
        onClick={() => setEditingNote(note)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setEditingNote(note);
          }
        }}
        role="button"
        tabIndex={0}
      >
        {note.imageURL && (
          <img className={styles.cardImage} src={note.imageURL} alt="" />
        )}
        <div className={styles.cardTitleRow}>
          <span className={styles.cardTitle}>{note.title || '無題のメモ'}</span>
          {note.isPinned && (
            <span className={styles.cardPin} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M12 2L12 12" />
                <path d="M18 8L18 12C18 14 16 16 12 16C8 16 6 14 6 12L6 8" />
                <path d="M12 16V22" />
                <path d="M8 22H16" />
              </svg>
            </span>
          )}
        </div>

        {note.noteType === 'checklist' && note.checkItems.length > 0 ? (
          <div className={styles.cardChecklist}>
            {note.checkItems.map((item) => (
              <label key={item.id} className={styles.cardCheckItem}>
                <input type="checkbox" checked={item.checked} readOnly />
                <span className={`${styles.cardCheckItemText} ${item.checked ? styles.cardCheckItemChecked : ''}`}>
                  {item.text}
                </span>
              </label>
            ))}
          </div>
        ) : (
          note.text && <div className={styles.cardText}>{renderNoteText(note.text, styles.memoLink)}</div>
        )}

        <div className={styles.cardDate}>{formatNoteDate(note.updatedAt)}</div>
      </div>
    );
  }

  function renderContent() {
    if (isLoadingRoom || isLoadingNotes) {
      return <div className={styles.loadingState}>メモを読み込み中...</div>;
    }

    if (!memoRoomId) {
      return (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateTitle}>個人メモを準備中です</div>
          <div className={styles.emptyStateText}>
            ホーム画面を開くとメモルームが自動作成されます。
          </div>
        </div>
      );
    }

    if (notes.length === 0) {
      return (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateTitle}>まだメモがありません</div>
          <div className={styles.emptyStateText}>
            上の入力欄から最初のメモを作成できます。
          </div>
        </div>
      );
    }

    return (
      <>
        {pinnedNotes.length > 0 && (
          <section className={styles.sectionBlock}>
            <h3 className={styles.sectionHeader}>固定済み</h3>
            <div className={styles.memoGrid}>
              {pinnedNotes.map((note) => renderCard(note))}
            </div>
          </section>
        )}

        {otherNotes.length > 0 && (
          <section className={styles.sectionBlock}>
            <h3 className={styles.sectionHeader}>{pinnedNotes.length > 0 ? 'その他' : 'メモ一覧'}</h3>
            <div className={styles.memoGrid}>
              {otherNotes.map((note) => renderCard(note))}
            </div>
          </section>
        )}
      </>
    );
  }

  return (
    <div
      {...modalProps}
      className={styles.overlay}
      onClick={onClose}
      aria-labelledby="personal-memo-modal-title"
    >
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 id="personal-memo-modal-title" className={styles.modalTitle}>個人メモ</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="個人メモを閉じる"
          >
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          {memoRoomId && (
            <div className={styles.composer}>
              <input
                type="text"
                className={styles.composerTitleInput}
                placeholder="タイトル"
                value={composerTitle}
                onChange={(event) => setComposerTitle(event.target.value)}
              />
              <textarea
                className={styles.composerTextarea}
                placeholder="個人メモを入力..."
                value={composerText}
                onChange={(event) => setComposerText(event.target.value)}
              />
              <div className={styles.composerActions}>
                <span className={styles.composerHint}>画像や色変更はメモを開いてから編集できます</span>
                <button
                  type="button"
                  className={styles.composerSaveButton}
                  onClick={() => {
                    void handleCreateNote();
                  }}
                  disabled={creatingNote || (!composerTitle.trim() && !composerText.trim())}
                >
                  {creatingNote ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          )}

          {renderContent()}
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.openMemoLink}
            onClick={handleOpenMemoPage}
            disabled={!memoRoomId}
          >
            {memoRoomId ? 'メモ画面を開く' : 'メモルーム準備中'}
          </button>
        </div>

        {editingNote && (
          <div onClick={(event) => event.stopPropagation()}>
            <MemoEditModal
              note={editingNote}
              onSave={(updates) => {
                void updateNote(editingNote.id, updates);
                setEditingNote(null);
              }}
              onDelete={() => {
                void deleteNote(editingNote.id);
              }}
              onTogglePin={() => {
                void togglePin(editingNote.id, editingNote.isPinned);
              }}
              onImageUpload={(file) => {
                void handleImageUpload(editingNote.id, file);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
