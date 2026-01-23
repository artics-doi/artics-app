// メインアプリケーション

import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Chat from './pages/Chat';
import { useGlobalNotification } from './hooks/useGlobalNotification';
import { useFCMToken } from './hooks/useFCMToken';

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
      <AuthenticatedNotificationListener />
      <HashRouter>
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
    </AuthProvider>
  );
}

export default App;
