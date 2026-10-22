import { describe, expect, test } from 'vitest';
import { BUNDLED_RELEASE_NOTES } from '../../src/data/releaseNotes';
import { mergeReleaseNotes } from '../../src/lib/releaseNotes';

describe('同梱の更新ノート', () => {
  test('新しい版が先頭で、v1.3.6 と v1.3.7 を含む', () => {
    const firstLine = BUNDLED_RELEASE_NOTES.trim().split('\n')[0];
    expect(firstLine).toBe('2026/10/22：v1.3.7：リンクの表示を改善');
    expect(BUNDLED_RELEASE_NOTES).toContain('2026/10/22：v1.3.6：リンク表示・コピー・添付を改善');
    expect(BUNDLED_RELEASE_NOTES).toContain('・ページのタイトルが取れないときも、サイト名とURLを表示するようにしました。');
  });
});

describe('Firestore の過去分を足す', () => {
  test('同梱と同じバージョンは捨て、古い版だけを後ろへ足す', () => {
    const remote = [
      '2026/10/22：v1.3.6：古い見出し',
      '・同梱と違う文',
      '',
      '2026/09/14：v1.3.4：工程管理の通知先と通知設定を改善',
      '・過去の項目',
      '',
      '2026/09/14：v1.3.4：重複',
      '・もう一度',
    ].join('\n');

    const merged = mergeReleaseNotes(BUNDLED_RELEASE_NOTES, remote);

    expect(merged.startsWith('2026/10/22：v1.3.7：リンクの表示を改善')).toBe(true);
    expect(merged).toContain('2026/10/22：v1.3.6：リンク表示・コピー・添付を改善');
    expect(merged).not.toContain('古い見出し');
    expect(merged).toContain('2026/09/14：v1.3.4：工程管理の通知先と通知設定を改善');
    expect(merged).not.toContain('・もう一度');
    expect(merged.indexOf('v1.3.7')).toBeLessThan(merged.indexOf('v1.3.4'));
  });

  test('Firestore が空でも同梱だけを返す', () => {
    expect(mergeReleaseNotes(BUNDLED_RELEASE_NOTES, '')).toBe(BUNDLED_RELEASE_NOTES.trim());
  });
});
