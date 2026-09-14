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
        <p>担当者に関係なく、全プロジェクトのタスクの動きを通知します。<br />この設定は全員が変更できます。</p>
        {!member.linkedUserId && <p role="status">アプリの登録ユーザーと紐付いていないため、通知を有効にできません。</p>}
        <fieldset disabled={saving || !member.linkedUserId} className={styles.notificationFields}>
          <label className={styles.notificationMaster}>
            <input type="checkbox" checked={draft.enabled}
              onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />
            通知を受け取る
            <span>{draft.enabled ? 'ON' : 'OFF'}</span>
          </label>
          <fieldset disabled={!draft.enabled} className={styles.notificationEvents}>
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
        {draft.enabled && draft.events.length === 0 && <p role="status">通知するアクションを1つ以上選んでください。</p>}
        {error && <p role="alert">{error}</p>}
        <div className={styles.notificationActions}>
          <button type="button" onClick={onClose} disabled={saving}>キャンセル</button>
          <button type="submit" disabled={saving || (draft.enabled && (!member.linkedUserId || draft.events.length === 0))}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
