import { isElectronEnv } from '../hooks/useElectronNotification';
import type { MemoNote } from '../types/memo';

const HTTP_URL_REGEX = /(https?:\/\/[^\s]+)/g;
const NAS_PATH_REGEX = /"(\\\\(?:Nas-1|Nas-3)\\[^"\r\n]+)"|(\\\\(?:Nas-1|Nas-3)\\[^\s\r\n]+)/g;

export function formatNoteDate(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (isToday) return time;
  if (isYesterday) return `昨日 ${time}`;
  const isThisYear = date.getFullYear() === now.getFullYear();
  if (isThisYear) return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

export function renderNoteText(
  text: string,
  linkClassName?: string
): React.ReactNode {
  if (!text) return null;
  const urlSegments = text.split(HTTP_URL_REGEX);
  return urlSegments.flatMap((segment, i) => {
    if (/^https?:\/\//.test(segment)) {
      return (
        <a
          key={`url-${i}`}
          href={segment}
          className={linkClassName}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation();
            if (isElectronEnv() && window.electronAPI?.openExternal) {
              e.preventDefault();
              window.electronAPI.openExternal(segment);
            }
          }}
        >
          {segment}
        </a>
      );
    }

    const matches = [...segment.matchAll(NAS_PATH_REGEX)];
    if (matches.length === 0) {
      return segment;
    }

    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    matches.forEach((match, matchIndex) => {
      const matchedPath = match[1] ?? match[2];
      const matchStart = match.index ?? 0;
      const matchEnd = matchStart + match[0].length;

      if (matchStart > lastIndex) {
        elements.push(segment.slice(lastIndex, matchStart));
      }

      if (isElectronEnv() && window.electronAPI?.openNasPath) {
        elements.push(
          <button
            key={`nas-${i}-${matchIndex}`}
            type="button"
            className={linkClassName}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.electronAPI?.openNasPath(matchedPath);
            }}
          >
            {match[0]}
          </button>
        );
      } else {
        elements.push(match[0]);
      }

      lastIndex = matchEnd;
    });

    if (lastIndex < segment.length) {
      elements.push(segment.slice(lastIndex));
    }

    return elements;
  });
}

export function sortNotes(notes: MemoNote[]): MemoNote[] {
  return [...notes].sort((a, b) => {
    if (a.orderIndex != null && b.orderIndex != null) {
      return a.orderIndex - b.orderIndex;
    }
    if (a.orderIndex != null) return -1;
    if (b.orderIndex != null) return 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}
