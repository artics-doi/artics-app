// 工程管理の共通レイアウト（左サイドバー + メイン領域 + Outlet）。
// /process 配下の全画面で共有する。PrivateRoute + Suspense は App.tsx 側で1回だけ包むので、
// このコンポーネントは「常に認証済み」前提で描画してよい。

import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { canUseProcess } from '../../utils/process/canUseProcess';
import { DashboardIcon, ListIcon, UsersIcon, ChevronLeftIcon } from '../../components/process/icons';
import '../../styles/process-tokens.css';
import styles from './ProcessLayout.module.css';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  // 現在地がこの prefix で始まるならアクティブ
  matchPrefix: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'ダッシュボード', path: '/process', icon: <DashboardIcon />, matchPrefix: '/process' },
  { label: 'プロジェクト一覧', path: '/process/projects', icon: <ListIcon />, matchPrefix: '/process/projects' },
  { label: 'メンバー管理', path: '/process/members', icon: <UsersIcon />, matchPrefix: '/process/members' },
  { label: '年度工数', path: '/process/effort-report', icon: <ListIcon />, matchPrefix: '/process/effort-report' },
];

export default function ProcessLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // PC 以外（スマホ等）では案内カードのみ表示する。
  if (!canUseProcess()) {
    return (
      <div className={styles.guard}>
        <div className={styles.guardCard}>
          <p className={styles.guardTitle}>工程管理はPCでご利用ください</p>
          <p className={styles.guardText}>
            工程管理（プロジェクト・カンバン・ガント）は画面の広いパソコンでの操作に最適化されています。
            お手元のPC、またはデスクトップアプリからアクセスしてください。
          </p>
          <button type="button" className={styles.guardLink} onClick={() => navigate('/schedule')}>
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  // ダッシュボード(index)はパス完全一致、それ以外は prefix 一致でアクティブ判定。
  function isActive(item: NavItem): boolean {
    if (item.path === '/process') {
      return location.pathname === '/process' || location.pathname === '/process/';
    }
    return location.pathname.startsWith(item.matchPrefix);
  }

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar} aria-label="工程管理メニュー">
        <button type="button" className={styles.backButton} onClick={() => navigate('/schedule')}>
          <ChevronLeftIcon size={16} />
          ホームに戻る
        </button>
        <div className={styles.brand}>工程管理</div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.path}
              className={`${styles.navItem} ${isActive(item) ? styles.navItemActive : ''}`}
              aria-current={isActive(item) ? 'page' : undefined}
              onClick={() => navigate(item.path)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className={styles.main} id="main-content">
        <Outlet />
      </main>
    </div>
  );
}
