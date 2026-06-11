export interface CheckItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface MemoNote {
  id: string;
  title: string;
  text: string;
  imageURL: string | null;
  storagePath: string | null;
  fileSize: number | null;
  isPinned: boolean;
  colorId: string | null;
  noteType: 'text' | 'checklist';
  checkItems: CheckItem[];
  orderIndex: number | null;
  createdAt: Date;
  updatedAt: Date;
}
