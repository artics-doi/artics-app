// メンバー詳細の型
export interface MemberDetails {
  [uid: string]: {
    displayName: string;
    photoURL?: string | null;
  };
}

// ExtendedMessage は types/index.ts に移動。barrel 互換のため re-export する。
export type { ExtendedMessage } from '../../types';
