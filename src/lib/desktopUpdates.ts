// デスクトップ版の更新ファイルを、どのファイル名で配信してよいかを決める純ロジック。
// ファイルのコピーや Firebase への公開は scripts/stage-desktop-updates.mts が行う。

const SAFE_BASENAME = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;
const SITE_ID = /^[a-z0-9](?:[a-z0-9-]{2,28}[a-z0-9])$/;
const UPDATES_PUBLIC_DIR = 'desktop-updates';

export interface FeedConfigCheck {
  ok: boolean;
  errors: string[];
  feedUrl: string;
  siteId: string;
}

export interface UpdateFilePlan {
  ok: boolean;
  errors: string[];
  files: string[];
  version: string;
}

interface ElectronBuilderConfig {
  publish?: unknown;
}

interface DesktopUpdatesHostingConfig {
  hosting?: {
    site?: unknown;
    public?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** サイト ID から、認証なしで開ける更新フィードの URL を作る。末尾の / は必須。 */
export function feedUrlForSite(siteId: string): string {
  return `https://${siteId}.web.app/`;
}

/**
 * electron-updater と同じ規則でフィード URL を揃える。
 * 末尾に / が無いと、latest.yml が1つ上のパスへ解決される。
 */
export function normalizeFeedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return '';
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return '';
    if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '';
  }
}

function asPublishList(publish: unknown): unknown[] {
  if (Array.isArray(publish)) return publish;
  if (publish == null) return [];
  return [publish];
}

/**
 * ビルド設定と Hosting 設定が、同じ公開 URL を指しているかを確かめる。
 * publish を複数にすると、アプリに書き込まれる更新先は先頭の1件だけになる。
 */
export function checkUpdateFeedConfig(
  electronBuilder: ElectronBuilderConfig,
  hostingConfig: DesktopUpdatesHostingConfig,
): FeedConfigCheck {
  const errors: string[] = [];
  const publishes = asPublishList(electronBuilder.publish);
  const entry = publishes.length === 1 && isRecord(publishes[0]) ? publishes[0] : null;

  if (publishes.length !== 1 || entry?.provider !== 'generic') {
    errors.push(
      'electron-builder.json の publish は generic を1件だけにしてください。github を残すと、新しいアプリも非公開リポジトリを見に行きます。',
    );
  }
  if (entry?.provider === 'generic' && entry.useMultipleRangeRequest !== false) {
    errors.push(
      'publish.useMultipleRangeRequest は false にしてください。Firebase Hosting では分割ダウンロードが失敗しやすいです。',
    );
  }

  const siteId = typeof hostingConfig.hosting?.site === 'string' ? hostingConfig.hosting.site : '';
  if (!SITE_ID.test(siteId)) {
    errors.push('firebase.desktop-updates.json の hosting.site は、小文字・数字・ハイフンの 4〜30 文字にしてください。');
  }
  if (hostingConfig.hosting?.public !== UPDATES_PUBLIC_DIR) {
    errors.push(`更新ファイルの公開ディレクトリは ${UPDATES_PUBLIC_DIR} にしてください。PWA の dist とは混ぜません。`);
  }

  const expected = siteId ? feedUrlForSite(siteId) : '';
  const actual = typeof entry?.url === 'string' ? normalizeFeedUrl(entry.url) : '';
  if (entry?.provider === 'generic' && actual !== expected) {
    errors.push('publish.url が更新専用サイトの URL と一致しません。ビルド前に両方を同じ住所にしてください。');
  }

  return {
    ok: errors.length === 0,
    errors,
    feedUrl: expected,
    siteId,
  };
}

function isSafeBasename(name: string): boolean {
  return SAFE_BASENAME.test(name) && !name.includes('..') && !name.includes('/') && !name.includes('\\');
}

function readLatestYml(ymlText: string): { version: string; fileNames: string[]; errors: string[] } {
  const errors: string[] = [];
  let version = '';
  const fileNames: string[] = [];

  for (const line of ymlText.split(/\r?\n/)) {
    if (line.trim() === '' || /^\s*#/.test(line)) continue;

    if (!/^\s/.test(line)) {
      const versionMatch = /^version:\s*(.+?)\s*$/.exec(line);
      if (versionMatch) {
        version = unquote(versionMatch[1]);
        continue;
      }
      const pathMatch = /^path:\s*(.+?)\s*$/.exec(line);
      if (pathMatch) {
        fileNames.push(unquote(pathMatch[1]));
        continue;
      }
    }

    const urlMatch = /^\s*(?:-\s*)?url:\s*(.+?)\s*$/.exec(line);
    if (urlMatch) fileNames.push(unquote(urlMatch[1]));
  }

  if (!version) errors.push('latest.yml に version がありません。');
  return { version, fileNames, errors };
}

/**
 * latest.yml に書かれたインストーラーと、その blockmap だけを配信対象にする。
 * フォルダ名や URL が入っていたら拒否する。古いファイルを一緒に公開しないため。
 */
export function planDesktopUpdateFiles(input: {
  ymlText: string;
  expectedVersion: string;
  availableNames: readonly string[];
}): UpdateFilePlan {
  const parsed = readLatestYml(input.ymlText);
  const errors = [...parsed.errors];
  const available = new Set(input.availableNames);
  const files = new Set<string>(['latest.yml']);

  if (parsed.version && parsed.version !== input.expectedVersion) {
    errors.push(
      `latest.yml の version は ${parsed.version} ですが、package.json は ${input.expectedVersion} です。同じバージョンでビルドし直してください。`,
    );
  }
  if (!available.has('latest.yml')) {
    errors.push('release/latest.yml がありません。Windows で npm run build:electron を実行してください。');
  }
  if (parsed.fileNames.length === 0) {
    errors.push('latest.yml にインストーラーのファイル名がありません。');
  }

  let sawInstaller = false;
  for (const name of parsed.fileNames) {
    if (!isSafeBasename(name)) {
      errors.push(`配信できないファイル名です（${name}）。URL やフォルダは書かず、ファイル名だけにしてください。`);
      continue;
    }
    files.add(name);
    if (!available.has(name)) {
      errors.push(`release/${name} がありません。latest.yml のファイル名と実ファイルを一致させてください。`);
    }
    if (name.toLowerCase().endsWith('.exe')) {
      sawInstaller = true;
      const blockmap = `${name}.blockmap`;
      files.add(blockmap);
      if (!available.has(blockmap)) {
        errors.push(`release/${blockmap} がありません。差分更新用の blockmap も一緒に配信します。`);
      }
    }
  }
  if (parsed.fileNames.length > 0 && !sawInstaller) {
    errors.push('latest.yml に .exe インストーラーがありません。');
  }

  return {
    ok: errors.length === 0,
    errors,
    files: [...files],
    version: parsed.version,
  };
}

/** インストール済みアプリの中に書き込まれた app-update.yml が、意図したフィードを指すか。 */
export function checkEmbeddedUpdateConfig(
  text: string,
  expectedFeedUrl: string,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  let provider = '';
  let url = '';
  let multipleRange = '';

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('provider:')) provider = unquote(trimmed.slice('provider:'.length));
    if (trimmed.startsWith('url:')) url = unquote(trimmed.slice('url:'.length));
    if (trimmed.startsWith('useMultipleRangeRequest:')) {
      multipleRange = unquote(trimmed.slice('useMultipleRangeRequest:'.length));
    }
  }

  if (provider !== 'generic') {
    errors.push('アプリに埋め込まれた更新先が generic ではありません。このビルドは GitHub を見に行きます。');
  }
  if (normalizeFeedUrl(url) !== normalizeFeedUrl(expectedFeedUrl)) {
    errors.push('アプリに埋め込まれた更新 URL が、更新専用サイトと一致しません。');
  }
  if (multipleRange !== 'false') {
    errors.push('アプリに埋め込まれた useMultipleRangeRequest が false ではありません。');
  }

  return { ok: errors.length === 0, errors };
}
