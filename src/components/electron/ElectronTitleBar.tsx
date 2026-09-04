import { useEffect, useState, type MouseEvent } from 'react';
import type { WindowControlsState } from '../../types/electron';
import styles from './ElectronTitleBar.module.css';

const INITIAL_STATE: WindowControlsState = { maximized: false, compact: false };

export default function ElectronTitleBar() {
  const [windowState, setWindowState] = useState<WindowControlsState>(INITIAL_STATE);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return undefined;
    void api.getWindowControlsState().then(setWindowState);
    return api.onWindowControlsStateChanged(setWindowState);
  }, []);

  function handleTitleBarDoubleClick(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('button')) return;
    void window.electronAPI?.toggleMaximizeWindow().then(setWindowState);
  }

  return (
    <header className={styles.titleBar} onDoubleClick={handleTitleBarDoubleClick}>
      <div className={styles.brand} aria-label="Artics">
        <img src="/favicon.png" alt="" aria-hidden="true" />
        <span>Artics</span>
      </div>
      <div className={styles.dragRegion} />
      <nav className={styles.controls} aria-label="ウィンドウ操作">
        <button
          type="button"
          className={styles.chatCompactButton}
          onClick={() => void window.electronAPI?.toggleChatCompact().then(setWindowState)}
          aria-label={windowState.compact ? '元のウィンドウサイズに戻す' : 'コンパクトなチャット一覧を表示'}
          title={windowState.compact ? '元のウィンドウサイズに戻す' : 'コンパクトなチャット一覧を表示'}
        >
          {windowState.compact ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5M3 8l6-6M21 8l-6-6M3 16l6 6M21 16l-6 6" />
            </svg>
          ) : (
            <svg className={styles.chatIcon} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3C6.9 3 3 6.5 3 11c0 2.2 1 4.2 2.7 5.7L4.6 21l4.6-2.1c.9.2 1.8.4 2.8.4 5.1 0 9-3.5 9-8.1S17.1 3 12 3Zm-4 7h8v1.7H8V10Zm0 3.4h5.5v1.7H8v-1.7Z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className={styles.windowButton}
          onClick={() => void window.electronAPI?.minimizeWindow()}
          aria-label="最小化"
          title="最小化"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <button
          type="button"
          className={styles.windowButton}
          onClick={() => void window.electronAPI?.toggleMaximizeWindow().then(setWindowState)}
          aria-label={windowState.maximized ? '元のサイズに戻す' : '最大化'}
          title={windowState.maximized ? '元のサイズに戻す' : '最大化'}
        >
          {windowState.maximized ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h10v10H8zM6 15H4V4h11v2" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z" /></svg>
          )}
        </button>
        <button
          type="button"
          className={`${styles.windowButton} ${styles.closeButton}`}
          onClick={() => void window.electronAPI?.closeWindow()}
          aria-label="閉じる"
          title="閉じる"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </nav>
    </header>
  );
}
