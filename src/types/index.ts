// アプリケーション全体で使用する型定義

// ユーザー情報
export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  createdAt: Date;
  lastSeen: Date;
  isOnline: boolean;
}

// チャットルーム
export interface ChatRoom {
  id: string;
  name: string;                    // グループ名（1対1の場合は空）
  type: 'direct' | 'group';        // 1対1 or グループ
  photoURL?: string | null;        // グループ画像URL
  members: string[];               // メンバーのUID配列
  memberDetails: {                 // メンバーの詳細情報
    [uid: string]: {
      displayName: string;
      photoURL: string | null;
    }
  };
  lastMessage: {
    text: string;
    senderId: string;
    senderName: string;
    timestamp: Date;
  } | null;
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
  readBy: string[];                // 既読者のUID配列
  createdAt: Date;
}

// 既読情報
export interface ReadReceipt {
  oderId: string;
  readAt: Date;
}
