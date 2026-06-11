import styles from '../../pages/Chat.module.css';
import { REACTION_EMOJIS } from '../../constants';

interface ReactionPickerProps {
  currentUserReactions: string[];
  onSelect: (emoji: string) => void;
}

export default function ReactionPicker({
  currentUserReactions,
  onSelect
}: ReactionPickerProps) {
  return (
    <div className={styles.reactionPicker} onClick={(e) => e.stopPropagation()}>
      {REACTION_EMOJIS.map(emoji => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className={currentUserReactions.includes(emoji) ? styles.reacted : ''}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
