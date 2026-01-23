// メインアプリケーション

import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ActiveRoomProvider } from './contexts/ActiveRoomContext';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Chat from './pages/Chat';
import { useGlobalNotification } from './hooks/useGlobalNotification';
import { useFCMToken } from './hooks/useFCMToken';
import { useEffect } from 'react';
import { isElectronEnv } from './hooks/useElectronNotification';

// グローバル通知監視コンポーネント
function GlobalNotificationListener() {
  useGlobalNotification();
  return null;
}

// FCMトークン初期化コンポーネント
function FCMTokenInitializer() {
  useFCMToken();
  return null;
}

// Electron環境でのルーム遷移リスナー
function ElectronNavigationListener() {
  const navigate = useNavigate();

  useEffect(() => {
    if (isElectronEnv() && window.electronAPI?.onNavigateToRoom) {
      const cleanup = window.electronAPI.onNavigateToRoom((roomId: string) => {
        console.log('[ElectronNavigationListener] navigate-to-room:', roomId);
        navigate(`/chat/${roomId}`);
      });
      return cleanup;
    }
  }, [navigate]);

  return null;
}

// 認証済みの場合のみグローバル通知を有効化
function AuthenticatedNotificationListener() {
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  return (
    <>
      <GlobalNotificationListener />
      <FCMTokenInitializer />
    </>
  );
}

// Electron環境ではfile://プロトコルを使うためHashRouterが必要
function App() {
  return (
    <AuthProvider>
      <ActiveRoomProvider>
        <AuthenticatedNotificationListener />
        <HashRouter>
        <ElectronNavigationListener />
        <Routes>
          {/* 認証不要のページ */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* 認証が必要なページ */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Home />
              </PrivateRoute>
            }
          />
          <Route
            path="/chat/:roomId"
            element={
              <PrivateRoute>
                <Chat />
              </PrivateRoute>
            }
          />

          {/* 存在しないパスはホームにリダイレクト */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        </HashRouter>
      </ActiveRoomProvider>
    </AuthProvider>
  );
}

export default App;
