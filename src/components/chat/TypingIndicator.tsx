import { useEffect, useMemo, useState } from 'react';
import type { Timestamp } from 'firebase/firestore';
import type { ChatRoom } from '../../types';
import { TYPING_TIMEOUT } from '../../hooks/useTypingIndicator';
import styles from './TypingIndicator.module.css';

interface TypingIndicatorProps {
  typing?: Record<string, Timestamp>;
  memberDetails?: ChatRoom['memberDetails'];
  currentUserUid?: string;
}

export default function TypingIndicator({
  typing,
  memberDetails,
  currentUserUid
}: TypingIndicatorProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const typingUsers = useMemo(() => {
    if (!typing || !memberDetails || !currentUserUid) return [];

    return Object.entries(typing)
      .filter(([uid, timestamp]) => {
        if (uid === currentUserUid) return false;
        if (!timestamp || typeof timestamp.toMillis !== 'function') return false;
        return now - timestamp.toMillis() <= TYPING_TIMEOUT;
      })
      .map(([uid]) => memberDetails[uid]?.displayName ?? '不明なユーザー');
  }, [typing, memberDetails, currentUserUid, now]);

  const isVisible = typingUsers.length > 0;
  const typingLabel = isVisible ? `${typingUsers.join('、')}が入力中...` : '\u00A0';

  return (
    <div className={styles.container} aria-live="polite" aria-atomic="true">
      <div className={`${styles.content} ${!isVisible ? styles.hidden : ''}`}>
        <span className={styles.text}>{typingLabel}</span>
        <span className={styles.dots} aria-hidden="true">
          <span className={styles.dot}></span>
          <span className={styles.dot}></span>
          <span className={styles.dot}></span>
        </span>
      </div>
    </div>
  );
}
