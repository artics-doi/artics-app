import { useState } from 'react';
import type { ProcessMember } from '../../types/process';
import styles from '../../pages/process/Members.module.css';

export default function TaskProgressManagersSection({ members, loading, onChange }: {
  members: ProcessMember[];
  loading: boolean;
  onChange: (memberId: string, isManager: boolean) => Promise<void>;
}) {
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const managers = members.filter(member => member.isTaskProgressManager);
  const candidates = members.filter(member => member.linkedUserId && !member.isTaskProgressManager);
  const change = async (memberId: string, isManager: boolean) => {
    setSaving(true);
    setError('');
    try { await onChange(memberId, isManager); setSelected(''); }
    catch { setError('進捗管理者の設定を保存できませんでした。もう一度お試しください。'); }
    finally { setSaving(false); }
  };
  return (
    <section className={styles.managerSection} aria-labelledby="task-progress-managers-title">
      <div className={styles.managerHeading}>
        <h2 id="task-progress-managers-title">タスク進捗管理者</h2>
        <span className={styles.managerBadge}>全タスク・全通知</span>
      </div>
      <p className={styles.subTitle}>担当者や個別の通知設定に関係なく、全プロジェクトの新タスク・状態変更・完了承認を受け取ります。複数人を指定でき、全員が追加・解除できます。</p>
      {loading ? <p role="status">読み込み中...</p> : managers.length === 0 ? <p className={styles.subTitle}>進捗管理者はまだ指定されていません。</p> : (
        <ul className={styles.managerList}>
          {managers.map(member => (
            <li key={member.id}>
              <span>{member.name}{!member.linkedUserId && <small>（アカウント未連携・通知不可）</small>}</span>
              <button type="button" aria-label={`${member.name}を進捗管理者から解除`} disabled={saving}
                onClick={() => void change(member.id, false)}>解除</button>
            </li>
          ))}
        </ul>
      )}
      <form className={styles.managerAdd} onSubmit={event => {
        event.preventDefault();
        if (candidates.some(member => member.id === selected)) void change(selected, true);
      }}>
        <label htmlFor="progress-manager-member">進捗管理者を追加</label>
        <select id="progress-manager-member" value={candidates.some(member => member.id === selected) ? selected : ''}
          onChange={event => setSelected(event.target.value)} disabled={saving || loading || candidates.length === 0}>
          <option value="">登録メンバーから選択</option>
          {candidates.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
        <button type="submit" disabled={saving || loading || !candidates.some(member => member.id === selected)}>追加</button>
      </form>
      <p className={styles.managerHelp}>候補にいないアカウントは、先に「メンバーを追加」で登録してください。解除しても担当者や個別の通知設定は変わりません。</p>
      {saving && <p role="status">保存中…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
