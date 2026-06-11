// 画像プレビューモーダル（拡大・縮小機能付き）

import { useEffect, useState, useRef } from 'react';
import styles from './ImagePreviewModal.module.css';
import useModal from '../hooks/useModal';

interface ImagePreviewModalProps {
  imageURL: string;
  fileName?: string;
  onClose: () => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const SCALE_STEP = 0.25;

export default function ImagePreviewModal({ imageURL, fileName, onClose }: ImagePreviewModalProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const { modalProps } = useModal({ isOpen: true, onClose });

  // +/-キーでズーム
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') {
        setScale(prev => Math.min(prev + SCALE_STEP, MAX_SCALE));
      } else if (e.key === '-') {
        setScale(prev => Math.max(prev - SCALE_STEP, MIN_SCALE));
      } else if (e.key === '0') {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // マウスホイールでズーム
  useEffect(() => {
    const container = imageContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        setScale(prev => Math.min(prev + SCALE_STEP, MAX_SCALE));
      } else {
        setScale(prev => Math.max(prev - SCALE_STEP, MIN_SCALE));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // ズームイン
  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + SCALE_STEP, MAX_SCALE));
  };

  // ズームアウト
  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - SCALE_STEP, MIN_SCALE));
  };

  // ズームリセット
  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // ドラッグ開始
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  // ドラッグ中
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  // ドラッグ終了
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // ダウンロード処理
  const handleDownload = async () => {
    try {
      const response = await fetch(imageURL);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'image.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('ダウンロードエラー:', error);
      window.open(imageURL, '_blank');
    }
  };

  // ズーム率の表示
  const zoomPercent = Math.round(scale * 100);

  return (
    <div
      {...modalProps}
      className={styles.overlay}
      onClick={onClose}
      aria-labelledby="image-preview-modal-title"
    >
      <div className={styles.container} onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className={styles.header}>
          <span id="image-preview-modal-title" className={styles.fileName}>{fileName || '画像'}</span>
          <div className={styles.actions}>
            {/* ズームコントロール */}
            <div className={styles.zoomControls}>
              <button
                className={styles.zoomButton}
                onClick={handleZoomOut}
                disabled={scale <= MIN_SCALE}
                title="縮小 (-)"
              >
                −
              </button>
              <span className={styles.zoomLevel}>{zoomPercent}%</span>
              <button
                className={styles.zoomButton}
                onClick={handleZoomIn}
                disabled={scale >= MAX_SCALE}
                title="拡大 (+)"
              >
                +
              </button>
              <button
                className={styles.resetButton}
                onClick={handleResetZoom}
                title="リセット (0)"
              >
                リセット
              </button>
            </div>
            <button
              className={styles.downloadButton}
              onClick={handleDownload}
              title="ダウンロード"
            >
              ダウンロード
            </button>
            <button
              className={styles.closeButton}
              onClick={onClose}
              title="閉じる (ESC)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 画像 */}
        <div
          ref={imageContainerRef}
          className={styles.imageContainer}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        >
          <img
            src={imageURL}
            alt={fileName || '画像プレビュー'}
            className={styles.image}
            style={{
              transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
              transition: isDragging ? 'none' : 'transform 0.1s ease-out'
            }}
            draggable={false}
          />
        </div>

        {/* 操作ヒント */}
        <div className={styles.hints}>
          マウスホイール: ズーム | ドラッグ: 移動 | ESC: 閉じる
        </div>
      </div>
    </div>
  );
}
