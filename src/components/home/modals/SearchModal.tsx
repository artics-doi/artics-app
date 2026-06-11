import { useEffect, useRef } from 'react';
import { SEARCH_DEBOUNCE_MS } from '../../../constants';
import styles from '../../../pages/Home.module.css';
import useModal from '../../../hooks/useModal';

interface SearchResult {
  roomId: string;
  roomName: string;
  messageId: string;
  text: string;
  senderName: string;
  timestamp: Date;
}

interface SearchModalProps {
  isOpen: boolean;
  searchQuery: string;
  searchResults: SearchResult[];
  searching: boolean;
  onClose: () => void;
  onSearchQueryChange: (query: string) => void;
  onSearch: () => void;
  onResultClick: (roomId: string, messageId: string) => void;
}

export default function SearchModal({
  isOpen,
  searchQuery,
  searchResults,
  searching,
  onClose,
  onSearchQueryChange,
  onSearch,
  onResultClick
}: SearchModalProps) {
  const handleClose = () => {
    onSearchQueryChange('');
    onClose();
  };

  const { modalProps } = useModal({ isOpen, onClose: handleClose });
  const onSearchRef = useRef(onSearch);

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  useEffect(() => {
    if (!isOpen || !searchQuery.trim()) return;

    const timeoutId = setTimeout(() => {
      onSearchRef.current();
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
  }, [isOpen, searchQuery]);

  if (!isOpen) return null;

  const formatSearchTime = (date: Date): string => {
    return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div
      {...modalProps}
      className={styles.modal}
      onClick={handleClose}
      aria-labelledby="search-modal-title"
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h2 id="search-modal-title">メッセージ検索</h2>

        <div className={styles.searchInputArea}>
          <input
            type="text"
            placeholder="キーワードを入力"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            className={styles.searchInput}
          />
          <button
            className={styles.searchSubmitButton}
            onClick={onSearch}
            disabled={searching || !searchQuery.trim()}
          >
            {searching ? '検索中...' : '検索'}
          </button>
        </div>

        <div className={styles.searchResults}>
          {searching ? (
            <p className={styles.searchStatus}>検索中...</p>
          ) : searchResults.length === 0 && searchQuery.trim() ? (
            <p className={styles.searchStatus}>検索結果がありません</p>
          ) : (
            searchResults.map((result, index) => (
              <div
                key={`${result.roomId}-${result.messageId}-${index}`}
                className={styles.searchResultItem}
                onClick={() => {
                  onResultClick(result.roomId, result.messageId);
                  handleClose();
                }}
              >
                <div className={styles.searchResultHeader}>
                  <span className={styles.searchResultRoom}>{result.roomName}</span>
                  <span className={styles.searchResultTime}>{formatSearchTime(result.timestamp)}</span>
                </div>
                <p className={styles.searchResultSender}>{result.senderName}</p>
                <p className={styles.searchResultText}>{result.text}</p>
              </div>
            ))
          )}
        </div>

        <button className={styles.closeButton} onClick={handleClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
