import { useEffect, useRef } from 'react';
import { SEARCH_DEBOUNCE_MS } from '../../../constants';
import type { GlobalSearchResult } from '../../../lib/search/globalSearch';
import styles from '../../../pages/Home.module.css';
import useModal from '../../../hooks/useModal';

interface SearchModalProps {
  isOpen: boolean;
  searchQuery: string;
  searchResults: GlobalSearchResult[];
  searching: boolean;
  onClose: () => void;
  onSearchQueryChange: (query: string) => void;
  onSearch: () => void;
  onResultClick: (result: GlobalSearchResult) => void;
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
        <h2 id="search-modal-title">全体検索</h2>

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
                key={`${result.kind}-${result.id}-${index}`}
                className={styles.searchResultItem}
                onClick={() => {
                  onResultClick(result);
                  handleClose();
                }}
              >
                <div className={styles.searchResultHeader}>
                  <span className={styles.searchResultRoom}>
                    {result.kind === 'chat' ? 'チャット' : result.kind === 'memo' ? 'メモ' : result.kind === 'schedule' ? '予定' : 'タスク'}
                    {' / '}
                    {result.title}
                  </span>
                  <span className={styles.searchResultTime}>{formatSearchTime(result.timestamp)}</span>
                </div>
                <p className={styles.searchResultSender}>{result.subtitle}</p>
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
