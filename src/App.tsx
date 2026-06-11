// メインアプリケーション

import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ActiveRoomProvider } from './contexts/ActiveRoomContext';
import { ToastProvider } from './contexts/ToastContext';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Chat from './pages/Chat';
import Memo from './pages/Memo';
import Schedule from './pages/Schedule';
import { useGlobalNotification } from './hooks/useGlobalNotification';
import { useScheduleNotifications } from './hooks/useScheduleNotifications';
import { useFCMToken } from './hooks/useFCMToken';
import { usePresence } from './hooks/usePresence';
import { useEffect, lazy, Suspense } from 'react';
import { isElectronEnv } from './hooks/useElectronNotification';
import { getAppEntryPath, isDesktopWorkspace } from './utils/navigation';

// PWA更新通知コンポーネント（PWA環境でのみ動的インポート）
const PWAUpdatePrompt = lazy(() => import('./components/PWAUpdatePrompt'));
// M-36: PWA インストールバナー（PWA 環境でのみ表示）
const PWAInstallBanner = lazy(() => import('./components/PWAInstallBanner'));

// 工程管理（PC専用・重いのでlazy分割）。/process 配下で共有するレイアウトと各画面。
const ProcessLayout = lazy(() => import('./pages/process/ProcessLayout'));
const ProcessDashboard = lazy(() => import('./pages/process/Dashboard'));
const ProcessProjectList = lazy(() => import('./pages/process/ProjectList'));
const ProcessMembers = lazy(() => import('./pages/process/Members'));
const ProcessBoard = lazy(() => import('./pages/process/Board'));
const ProcessGantt = lazy(() => import('./pages/process/Gantt'));
const ProcessEffortReport = lazy(() => import('./pages/process/EffortReport'));

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
  usePresence(currentUser?.uid);
  useScheduleNotifications(currentUser);
  if (!currentUser) return null;
  return (
    <>
      <GlobalNotificationListener />
      <FCMTokenInitializer />
    </>
  );
}

function UnknownRouteRedirect() {
  return <Navigate to={getAppEntryPath()} replace />;
}

function HomeRoute() {
  if (isDesktopWorkspace()) {
    return <Navigate to={getAppEntryPath()} replace />;
  }

  return (
    <PrivateRoute>
      <Home />
    </PrivateRoute>
  );
}

// Electron環境ではfile://プロトコルを使うためHashRouterが必要
function App() {
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const theme: 'light' | 'dark' = savedTheme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    // Electron環境では起動直後のWindowsタイトルバーも保存テーマに合わせる
    window.electronAPI?.setTitleBarTheme?.(theme);
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>
        <ActiveRoomProvider>
          {/* S3-G-3: WCAG AA Skip Link（Tab で最初にフォーカス可能） */}
          <a
            href="#main-content"
            style={{
              position: 'absolute',
              left: '-9999px',
              top: 0,
              zIndex: 99999,
              padding: '12px 16px',
              background: '#1a73e8',
              color: 'white',
              textDecoration: 'none',
              fontWeight: 600,
              borderRadius: 0,
            }}
            onFocus={(e) => {
              e.currentTarget.style.left = '0';
            }}
            onBlur={(e) => {
              e.currentTarget.style.left = '-9999px';
            }}
          >
            メインコンテンツへスキップ
          </a>
          <AuthenticatedNotificationListener />
          {/* PWA環境でのみ更新通知を表示（Electron環境では不要） */}
          {!isElectronEnv() && (
            <Suspense fallback={null}>
              <PWAUpdatePrompt />
              <PWAInstallBanner />
            </Suspense>
          )}
          <HashRouter>
            <ElectronNavigationListener />
            <Routes>
              {/* 認証不要のページ */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* 認証が必要なページ */}
              <Route
                path="/"
                element={<HomeRoute />}
              />
              <Route
                path="/chat/:roomId"
                element={
                  <PrivateRoute>
                    <Chat />
                  </PrivateRoute>
                }
              />
              <Route
                path="/schedule"
                element={
                  <PrivateRoute>
                    <Schedule />
                  </PrivateRoute>
                }
              />
              <Route
                path="/memo/:roomId"
                element={
                  <PrivateRoute>
                    <Memo />
                  </PrivateRoute>
                }
              />

              {/* 工程管理（ネストルート）。/process レベルで1回だけ PrivateRoute + Suspense で包み、
                  子ルートは追加ラップしない（既存のフラット個別ラップと整合しつつ未認証描画を防ぐ）。 */}
              <Route
                path="/process"
                element={
                  <PrivateRoute>
                    <Suspense fallback={<div style={{ padding: 24 }}>読み込み中...</div>}>
                      <ProcessLayout />
                    </Suspense>
                  </PrivateRoute>
                }
              >
                <Route index element={<ProcessDashboard />} />
                <Route path="projects" element={<ProcessProjectList />} />
                <Route path="members" element={<ProcessMembers />} />
                <Route path="effort-report" element={<ProcessEffortReport />} />
                <Route path="projects/:projectId/board" element={<ProcessBoard />} />
                <Route path="projects/:projectId/gantt" element={<ProcessGantt />} />
                {/* 工程管理内の不明パスは一覧へ（getAppEntryPath=/schedule には飛ばさない） */}
                <Route path="*" element={<Navigate to="/process/projects" replace />} />
              </Route>

              {/* 存在しないパスはホームにリダイレクト */}
              <Route path="*" element={<UnknownRouteRedirect />} />
            </Routes>
          </HashRouter>
        </ActiveRoomProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
