import styles from '../../../pages/Home.module.css';
import useModal from '../../../hooks/useModal';

interface ReleaseNotesModalProps {
  isOpen: boolean;
  releaseNotes: string;
  onClose: () => void;
}

type ReleaseNoteEntry = {
  date: string;
  version: string;
  title: string;
  items: string[];
};

const releaseNoteHeaderPattern = /^(\d{4}[/-]\d{2}[/-]\d{2})\s*[：:]\s*(v?\d+(?:\.\d+)+)(?:\s*[：:]\s*(.*))?$/;
const joinedReleaseNoteHeaderPattern = /(\S)(\d{4}[/-]\d{2}[/-]\d{2}\s*[：:]\s*v?\d+(?:\.\d+)+(?:\s*[：:])?)/g;

function parseReleaseNotes(releaseNotes: string): ReleaseNoteEntry[] {
  const entries: ReleaseNoteEntry[] = [];
  let current: ReleaseNoteEntry | null = null;
  const normalizedReleaseNotes = releaseNotes.replace(joinedReleaseNoteHeaderPattern, '$1\n$2');

  for (const rawLine of normalizedReleaseNotes.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const headerMatch = line.match(releaseNoteHeaderPattern);
    if (headerMatch) {
      current = {
        date: headerMatch[1].replaceAll('/', '-'),
        version: headerMatch[2].startsWith('v') ? headerMatch[2] : `v${headerMatch[2]}`,
        title: headerMatch[3]?.trim() ?? '',
        items: []
      };
      entries.push(current);
      continue;
    }

    if (!current) {
      current = {
        date: '',
        version: '',
        title: '更新内容',
        items: []
      };
      entries.push(current);
    }

    const itemText = line.replace(/^[-・]\s*/, '').trim();
    if (!current.title) {
      current.title = itemText;
    } else if (/^[-・]/.test(line)) {
      current.items.push(itemText);
    } else if (current.items.length > 0) {
      if (itemText.length <= 6) {
        current.items[current.items.length - 1] = `${current.items[current.items.length - 1]}${itemText}`;
      } else {
        current.items.push(itemText);
      }
    } else if (itemText.length <= 6) {
      current.title = `${current.title}${itemText}`;
    } else {
      current.items.push(itemText);
    }
  }

  return entries.sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return b.version.localeCompare(a.version, undefined, { numeric: true });
  });
}

export default function ReleaseNotesModal({
  isOpen,
  releaseNotes,
  onClose
}: ReleaseNotesModalProps) {
  const { modalProps } = useModal({ isOpen, onClose });

  if (!isOpen) return null;

  const parsedReleaseNotes = parseReleaseNotes(releaseNotes);

  return (
    <div
      {...modalProps}
      className={styles.modal}
      onClick={onClose}
      aria-labelledby="release-notes-modal-title"
    >
      <div className={`${styles.modalContent} ${styles.releaseNotesModalContent}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.releaseNotesHeader}>
          <div>
            <h2 id="release-notes-modal-title">更新ノート</h2>
            <p>最近の変更を日付ごとに確認できます</p>
          </div>
        </div>
        <div className={styles.releaseNotesContent}>
          {parsedReleaseNotes.length > 0 ? (
            <ol className={styles.releaseNotesTimeline}>
              {parsedReleaseNotes.map((entry, index) => (
                <li className={styles.releaseNoteEntry} key={`${entry.date}-${entry.version}-${index}`}>
                  <div className={styles.releaseNoteMarker} aria-hidden="true" />
                  <div className={styles.releaseNoteBody}>
                    <div className={styles.releaseNoteMeta}>
                      {entry.date && <time dateTime={entry.date}>{entry.date.replaceAll('-', '/')}</time>}
                      {entry.version && <span>{entry.version}</span>}
                    </div>
                    <h3>{entry.title || '更新内容'}</h3>
                    {entry.items.length > 0 && (
                      <ul>
                        {entry.items.map((item, itemIndex) => (
                          <li key={`${item}-${itemIndex}`}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.noReleaseNotes}>更新ノートはありません</p>
          )}
        </div>
        <button className={styles.closeButton} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
