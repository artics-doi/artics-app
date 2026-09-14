import { useEffect, useRef, useState } from 'react';
import type { ProcessMember, ProcessNotificationSettings } from '../../types/process';
import { normalizeProcessNotification, PROCESS_NOTIFICATION_EVENTS } from '../../lib/process/notifications';
import styles from '../../pages/process/Members.module.css';

export default function ProcessNotificationSettingsModal({ member, onSave, onClose }: {
  member: ProcessMember;
  onSave: (settings: ProcessNotificationSettings) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => normalizeProcessNotification(member.notification));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} className={styles.notificationDialog} aria-labelledby="process-notification-title"
      onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
      <form onSubmit={async event => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try { await onSave(draft); onClose(); }
        catch { setError('通知設定を保存できませんでした。もう一度お試しください。'); }
        finally { setSaving(false); }
      }}>
        <h2 id="process-notification-title">{member.name}さんの工程管理通知</h2>
        <p>自分が担当するタスクについて、受け取る通知を選びます。<br />この設定は全員が変更できます。</p>
        {member.isTaskProgressManager && <p className={styles.managerNotice}>タスク進捗管理者に指定されています。担当や下記の選択に関係なく、全タスクの全6種類の通知を受け取ります。下記の設定は管理者から外れた後に適用されます。</p>}
        {!member.linkedUserId && <p role="status">アプリの登録ユーザーと紐付いていないため、通知を受け取れません。</p>}
        <fieldset disabled={saving || !member.linkedUserId} className={styles.notificationFields}>
          <fieldset className={styles.notificationEvents}>
            <legend>通知するアクション</legend>
            {PROCESS_NOTIFICATION_EVENTS.map(item => (
              <label key={item.value}>
                <input type="checkbox" checked={draft.events.includes(item.value)} onChange={event => setDraft({
                  ...draft, events: event.target.checked ? [...draft.events, item.value] : draft.events.filter(value => value !== item.value),
                })} />
                {item.label}
              </label>
            ))}
          </fieldset>
        </fieldset>
        {draft.events.length === 0 && <p role="status">担当者として受け取る通知はありません。進捗管理者への通知はこの選択に影響されません。</p>}
        {error && <p role="alert">{error}</p>}
        <div className={styles.notificationActions}>
          <button type="button" onClick={onClose} disabled={saving}>キャンセル</button>
          <button type="submit" disabled={saving || !member.linkedUserId}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
