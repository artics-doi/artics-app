// 認証状態を管理するContext
// アプリ全体でログイン状態を共有するために使用

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

// Contextの型定義
interface AuthContextType {
  currentUser: FirebaseUser | null;  // 現在のログインユーザー
  loading: boolean;                   // 読み込み中かどうか
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

// Contextの作成
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Contextを使用するためのカスタムフック
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
  const [loading, setLoading] = useState(true);

  // ログイン処理
  async function login(email: string, password: string) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    // オンライン状態を更新
    await updateDoc(doc(db, 'users', userCredential.user.uid), {
      isOnline: true,
      lastSeen: serverTimestamp()
    });
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
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      isOnline: true
    });
  }

  // ログアウト処理
  async function logout() {
    if (currentUser) {
      // オフライン状態に更新
      await updateDoc(doc(db, 'users', currentUser.uid), {
        isOnline: false,
        lastSeen: serverTimestamp()
      });
    }
    await signOut(auth);
  }

  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    // クリーンアップ
    return unsubscribe;
  }, []);

  const value: AuthContextType = {
    currentUser,
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
