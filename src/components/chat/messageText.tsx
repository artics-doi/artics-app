// メッセージ本文のテキスト描画（URL リンク化・NAS パスボタン化・メンションハイライト）。
// Chat.tsx から機械的に移動（挙動変更なし）。showToast のみ引数で受け取る。
// 注意: コンポーネントではなく描画ヘルパーのため小文字 export のみ（react-refresh lint 対応）。

import { Fragment } from 'react';
import { isElectronEnv } from '../../hooks/useElectronNotification';
import type { ToastType } from '../../contexts/ToastContext';
import styles from '../../pages/Chat.module.css';
import { isAllowedHttpsUrl } from '../../lib/security/resourceTarget';

const HTTP_URL_REGEX = /(https?:\/\/[^\s]+)/g;
const NAS_PATH_REGEX = /"(\\\\(?:Nas-1|Nas-3)\\[^"\r\n]+)"|(\\\\(?:Nas-1|Nas-3)\\[^\s\r\n]+)/g;

type ShowToast = (type: ToastType, message: string) => void;

export function renderMentions(segment: string, keyPrefix: string): React.ReactNode[] {
  const parts = segment.split(/(@\S+)/g);
  return parts.map((part, index) => {
    if (part.startsWith('@')) {
      return <span key={`${keyPrefix}-mention-${index}`} className={styles.mention}>{part}</span>;
    }
    return <Fragment key={`${keyPrefix}-text-${index}`}>{part}</Fragment>;
  });
}

// メッセージテキストをレンダリング（URL・メンションをハイライト）
export function renderMessageText(text: string, showToast: ShowToast): React.ReactNode {
  if (!text) return null;

  const urlSegments = text.split(HTTP_URL_REGEX);

  return urlSegments.flatMap((urlSegment, i) => {
    if (isAllowedHttpsUrl(urlSegment)) {
      return (
        <a
          key={`url-${i}`}
          href={urlSegment}
          className={styles.messageLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (isElectronEnv() && window.electronAPI?.openExternal) {
              e.preventDefault();
              window.electronAPI.openExternal(urlSegment);
            }
          }}
        >
          {urlSegment}
        </a>
      );
    }

    const matches = [...urlSegment.matchAll(NAS_PATH_REGEX)];
    if (matches.length === 0) {
      return renderMentions(urlSegment, `segment-${i}`);
    }

    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    matches.forEach((match, matchIndex) => {
      const matchedPath = match[1] ?? match[2];
      const matchStart = match.index ?? 0;
      const matchEnd = matchStart + match[0].length;

      if (matchStart > lastIndex) {
        elements.push(...renderMentions(urlSegment.slice(lastIndex, matchStart), `segment-${i}-${matchIndex}`));
      }

      const electronClickable = isElectronEnv() && window.electronAPI?.openNasPath;
      if (electronClickable) {
        elements.push(
          <button
            key={`nas-${i}-${matchIndex}`}
            type="button"
            className={styles.messageLink}
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const opened = await window.electronAPI?.openNasPath(matchedPath);
              if (!opened) {
                showToast('warning', 'リンク先が見つからないか、開けませんでした');
              }
            }}
          >
            {match[0]}
          </button>
        );
      } else {
        elements.push(<Fragment key={`nas-text-${i}-${matchIndex}`}>{match[0]}</Fragment>);
      }

      lastIndex = matchEnd;
    });

    if (lastIndex < urlSegment.length) {
      elements.push(...renderMentions(urlSegment.slice(lastIndex), `segment-tail-${i}`));
    }

    return elements;
  });
}
