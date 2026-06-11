// 現在閲覧中のチャットルームを管理するContext
// useGlobalNotificationで通知を抑制するために使用

import { createContext, useContext, useState, type ReactNode } from 'react';

interface ActiveRoomContextType {
  activeRoomId: string | null;
  setActiveRoomId: (roomId: string | null) => void;
}

const ActiveRoomContext = createContext<ActiveRoomContextType | undefined>(undefined);

// TODO: split into Provider/hook files to enable Fast Refresh fully
// eslint-disable-next-line react-refresh/only-export-components
export function useActiveRoom() {
  const context = useContext(ActiveRoomContext);
  if (context === undefined) {
    throw new Error('useActiveRoom must be used within an ActiveRoomProvider');
  }
  return context;
}

interface ActiveRoomProviderProps {
  children: ReactNode;
}

export function ActiveRoomProvider({ children }: ActiveRoomProviderProps) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  return (
    <ActiveRoomContext.Provider value={{ activeRoomId, setActiveRoomId }}>
      {children}
    </ActiveRoomContext.Provider>
  );
}
