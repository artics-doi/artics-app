// 認証状態を管理するContext
// アプリ全体でログイン状態を共有するために使用

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  getIdTokenResult
} from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, set, serverTimestamp as rtdbServerTimestamp } from 'firebase/database';
import { auth, db, rtdb } from '../lib/firebase';

// Contextの型定義
interface AuthContextType {
  currentUser: FirebaseUser | null;  // 現在のログインユーザー
  isAdmin: boolean;                   // Firebase Auth custom claims admin === true
  loading: boolean;                   // 読み込み中かどうか
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

// Contextの作成
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Contextを使用するためのカスタムフック
// TODO: split into Provider/hook files to enable Fast Refresh fully
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Provider コンポーネント
interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // ログイン処理
  async function login(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  // 新規登録処理
  async function register(email: string, password: string, displayName: string) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);

    // プロフィールを更新
    await updateProfile(userCredential.user, { displayName });

    // Firestoreにユーザー情報を保存
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      uid: userCredential.user.uid,
      email: email,
      displayName: displayName,
      photoURL: null,
      createdAt: serverTimestamp()
    });

    // メモ用チャットルームを自動作成
    await setDoc(doc(db, 'chatRooms', `memo_${userCredential.user.uid}`), {
      name: 'メモ',
      type: 'memo',
      members: [userCredential.user.uid],
      memberDetails: {
        [userCredential.user.uid]: {
          displayName: displayName,
          photoURL: null
        }
      },
      lastMessage: null,
      unreadCounts: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  // ログアウト処理
  async function logout() {
    if (currentUser) {
      await set(ref(rtdb, `/status/${currentUser.uid}`), {
        online: false,
        lastSeen: rtdbServerTimestamp()
      });
    }
    await signOut(auth);
  }

  // 認証状態の監視
  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;

      setCurrentUser(user);

      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const tokenResult = await getIdTokenResult(user);
        if (!active) return;
        setIsAdmin(tokenResult.claims.admin === true);
      } catch (error) {
        console.error('管理者権限の取得に失敗しました:', error);
        if (!active) return;
        setIsAdmin(false);
      } finally {
        if (active) setLoading(false);
      }
    });

    // クリーンアップ
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value: AuthContextType = {
    currentUser,
    isAdmin,
    loading,
    login,
    register,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
