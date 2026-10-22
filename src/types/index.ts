// アプリケーション全体で使用する型定義

// ユーザー情報
export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  createdAt: Date;
  lifecycleState?: 'active' | 'disabling' | 'deleted';
  lifecycleVersion?: number;
  activeOperationId?: string;
}

// チャットルーム
export interface ChatRoom {
  id: string;
  name: string;                    // グループ名（1対1の場合は空）
  type: 'direct' | 'group' | 'memo'; // 1対1 or グループ or メモ
  createdBy?: string;               // direct/group の作成者。旧データは members[0] で補完
  deletionState?: 'active' | 'deleting' | 'delete_failed';
  directKey?: string;              // 1対1チャットの重複防止キー
  photoURL?: string | null;        // グループ画像URL
  photoStoragePath?: string | null; // グループ画像のFirebase Storage path
  photoFileSize?: number | null;    // グループ画像のStorage上の実サイズ
  members: string[];               // メンバーのUID配列
  memberDetails: {                 // メンバーの詳細情報
    [uid: string]: {
      displayName: string;
      photoURL: string | null;
    }
  };
  typing?: Record<string, import('firebase/firestore').Timestamp>;
  lastMessage: {
    text: string;
    senderId: string;
    senderName: string;
    timestamp: Date;
  } | null;
  unreadCounts?: { [userId: string]: number };  // ユーザーごとの未読数
  favorites?: string[];            // お気に入りしたユーザーIDの配列
  createdAt: Date;
  updatedAt: Date;
}

// メッセージ
export interface Message {
  id: string;
  chatRoomId: string;
  senderId: string;
  senderName: string;
  senderPhotoURL: string | null;
  text: string;
  imageURL: string | null;         // 画像のURL
  fileURL: string | null;          // ファイルのURL
  fileName: string | null;         // ファイル名
  fileType: string | null;         // ファイルの種類
  storagePath?: string | null;     // Firebase Storage path
  fileSize?: number | null;        // Storage上の実サイズ
  readBy: string[];                // 既読者のUID配列
  createdAt: Date;
}

// 拡張されたメッセージ型（編集・削除・リアクション・返信・ピン留め・メンション）
export interface ExtendedMessage extends Message {
  isEdited?: boolean;
  isDeleted?: boolean;
  reactions?: { [emoji: string]: string[] }; // emoji -> userIds
  reactionsByUser?: { [uid: string]: string[] }; // uid -> emoji[]
  replyTo?: {
    messageId: string;
    text: string;
    senderName: string;
  } | null;
  isPinned?: boolean;
  mentions?: string[]; // mentioned userIds
  linkPreview?: {
    url: string;
    title: string;
    description: string;
    siteName: string;
  } | null;
  // 楽観的更新用フラグ（Firestore には存在しないクライアント内部の状態）
  _pending?: 'sending' | 'failed';
}

// ルーム通知設定
export interface RoomNotificationSetting {
  muted: boolean;
  mutedAt?: Date;
}
