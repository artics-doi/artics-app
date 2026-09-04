// スマホ幅のホーム画面で画面下部に固定表示するタブバー。
//
// 以前はヘッダーに 6 つのボタンを横一列（6 カラムグリッド）で並べていたため、
// 幅 390px の端末では 1 カラム約 55px しかなく、ラベルが折り返して読めなかった。
// 主要な移動先はここへ移し、ヘッダーは検索・設定だけに絞る。
//
// 表示・非表示は Home.module.css の `@media (max-width: 640px)` が担当する
// （既定は `display: none`）。デスクトップの見た目は変えない。

import styles from '../../pages/Home.module.css';

export type MobileTab = 'chat' | 'schedule' | 'memo' | 'members';

interface MobileTabBarProps {
  activeTab: MobileTab;
  onSelectChat: () => void;
  onSelectSchedule: () => void;
  onSelectMemo: () => void;
  onSelectMembers: () => void;
}

export default function MobileTabBar({
  activeTab,
  onSelectChat,
  onSelectSchedule,
  onSelectMemo,
  onSelectMembers,
}: MobileTabBarProps) {
  const tabs: Array<{ id: MobileTab; label: string; onSelect: () => void; icon: React.ReactNode }> = [
    {
      id: 'chat',
      label: 'チャット',
      onSelect: onSelectChat,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      ),
    },
    {
      id: 'schedule',
      label: '予定表',
      onSelect: onSelectSchedule,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      id: 'memo',
      label: 'メモ',
      onSelect: onSelectMemo,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      ),
    },
    {
      id: 'members',
      label: 'メンバー',
      onSelect: onSelectMembers,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
  ];

  return (
    <nav className={styles.mobileTabBar} aria-label="メインナビゲーション">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            className={`${styles.mobileTab} ${isActive ? styles.mobileTabActive : ''}`}
            onClick={tab.onSelect}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className={styles.mobileTabIcon}>{tab.icon}</span>
            <span className={styles.mobileTabLabel}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
