// 担当者（工程管理メンバー）を複数選択するピッカー。TaskPanel から使う。
// メンバーが1人もいない場合はその旨を案内する。

import { PROCESS_COLORS, PROCESS_COLOR_COUNT } from '../../constants/process';
import type { ProcessMember } from '../../types/process';
import styles from './MemberPicker.module.css';

interface MemberPickerProps {
  members: ProcessMember[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

function accentOf(colorIndex: number): string {
  const idx = ((colorIndex % PROCESS_COLOR_COUNT) + PROCESS_COLOR_COUNT) % PROCESS_COLOR_COUNT;
  return PROCESS_COLORS[idx].accent;
}

export default function MemberPicker({ members, selectedIds, onChange }: MemberPickerProps) {
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  if (members.length === 0) {
    return (
      <p className={styles.empty}>
        メンバーが登録されていません。メンバー管理から担当者を追加してください。
      </p>
    );
  }

  return (
    <div className={styles.list}>
      {members.map((member) => {
        const selected = selectedIds.includes(member.id);
        return (
          <button
            key={member.id}
            type="button"
            className={`${styles.chip} ${selected ? styles.chipSelected : ''}`}
            onClick={() => toggle(member.id)}
            aria-pressed={selected}
          >
            <span className={styles.dot} style={{ background: accentOf(member.colorIndex) }} aria-hidden="true" />
            {member.name}
          </button>
        );
      })}
    </div>
  );
}
