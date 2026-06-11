// メッセージバブルのインタラクション層。
//
// 既存の onClick によるメニュー開閉に加え、長押し / 右クリックでも同じ動作を起こすため、
// 個別の useLongPress を使えるよう小さなコンポーネントとして分離している。
//
// 親（Chat.tsx）から渡される onToggleMenu を、タップ / 長押し / コンテキストメニューの
// すべてで同じハンドラとして呼ぶ。

import { useCallback, type ReactNode } from 'react';
import { useLongPress } from '../../hooks/useLongPress';

interface MessageBubbleInteractiveProps {
  messageId: string;
  className: string;
  onToggleMenu: (messageId: string) => void;
  children: ReactNode;
}

export default function MessageBubbleInteractive({
  messageId,
  className,
  onToggleMenu,
  children,
}: MessageBubbleInteractiveProps) {
  const handleAction = useCallback(() => {
    onToggleMenu(messageId);
  }, [messageId, onToggleMenu]);

  const longPress = useLongPress({
    onLongPress: handleAction,
    onTap: handleAction,
    ms: 500,
  });

  return (
    // useLongPress の onTap が click 相当を担う。onClick は冗長になるため付けない。
    <div className={className} {...longPress}>
      {children}
    </div>
  );
}
