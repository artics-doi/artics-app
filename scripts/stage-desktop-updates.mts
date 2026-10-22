// デスクトップ更新ファイルを desktop-updates/ へコピーし、明示したときだけ Hosting へ公開する。
// 値の入った .env は読まない。PWA 用の dist にも触らない。
// package.json に "type": "module" は付けない。付けるとアプリ全体のモジュール解決が変わる。
// 実行時の MODULE_TYPELESS_PACKAGE_JSON 警告は npm script 側で消している。

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkEmbeddedUpdateConfig,
  checkUpdateFeedConfig,
  planDesktopUpdateFiles,
} from '../src/lib/desktopUpdates.ts';

const STAGED_ARTIFACT = /^[A-Za-z0-9][A-Za-z0-9._+-]*\.(?:yml|exe|blockmap)$/i;
const DEPLOY_SWITCH = 'ARTICS_DEPLOY_DESKTOP_UPDATES';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(errors: readonly string[]): never {
  for (const error of errors) console.error(error);
  process.exit(1);
}

function readJson(relativePath: string): unknown {
  const fullPath = path.join(repoRoot, relativePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8')) as unknown;
}

function assertInside(directory: string, name: string): string {
  const root = path.resolve(directory);
  const target = path.resolve(root, name);
  const relative = path.relative(root, target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail([`配信フォルダの外を指しています: ${name}`]);
  }
  return target;
}

function listReleaseFiles(): string[] {
  const releaseDir = path.join(repoRoot, 'release');
  if (!fs.existsSync(releaseDir)) {
    fail(['release/ がありません。Windows で npm run build:electron を先に実行してください。']);
  }
  return fs.readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

function stage(fileNames: readonly string[]): void {
  const releaseDir = path.join(repoRoot, 'release');
  const targetDir = path.join(repoRoot, 'desktop-updates');
  fs.mkdirSync(targetDir, { recursive: true });

  // 前回のインストーラーを残すと、古いファイルも公開される。説明用の README は消さない。
  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (!entry.isFile() || !STAGED_ARTIFACT.test(entry.name)) continue;
    fs.unlinkSync(path.join(targetDir, entry.name));
  }

  for (const name of fileNames) {
    const source = assertInside(releaseDir, name);
    const sourceStat = fs.lstatSync(source);
    if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) {
      fail([`${name} は通常のファイルではないためコピーしません。`]);
    }
    fs.copyFileSync(source, assertInside(targetDir, name));
  }
}

function embeddedFeedErrors(expectedFeedUrl: string): string[] {
  const embeddedPath = path.join(repoRoot, 'release', 'win-unpacked', 'resources', 'app-update.yml');
  if (!fs.existsSync(embeddedPath)) {
    console.log('release/win-unpacked が無いので、アプリ内部の更新先確認はスキップしました。');
    console.log('Windows でビルドしたあと、resources/app-update.yml が generic になっていることを確認してください。');
    return [];
  }
  const text = fs.readFileSync(embeddedPath, 'utf8');
  return checkEmbeddedUpdateConfig(text, expectedFeedUrl).errors;
}

function deploy(projectId: string): void {
  if (process.env[DEPLOY_SWITCH] !== '1') {
    console.log('');
    console.log('ファイルのコピーは終わりました。Firebase への公開はしていません。');
    console.log('公開するときは、スイッチを付けてから同じコマンドを実行します。');
    if (process.platform === 'win32') {
      console.log(`  PowerShell: $env:${DEPLOY_SWITCH}='1'; npm run publish:desktop-updates`);
      console.log(`  コマンドプロンプト: set ${DEPLOY_SWITCH}=1&& npm run publish:desktop-updates`);
    } else {
      console.log(`  ${DEPLOY_SWITCH}=1 npm run publish:desktop-updates`);
    }
    process.exit(2);
  }

  const cli = path.join(repoRoot, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
  if (!fs.existsSync(cli)) {
    fail(['firebase-tools が見つかりません。リポジトリ直下で npm ci を実行してください。']);
  }

  console.log(`更新専用サイトへ公開します。プロジェクト: ${projectId}`);
  const result = spawnSync(process.execPath, [
    cli,
    'deploy',
    '--only',
    'hosting',
    '--config',
    'firebase.desktop-updates.json',
    '--project',
    projectId,
    '--non-interactive',
  ], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--deploy')) {
    fail(['使える引数は --deploy だけです。引数なしならコピーのみ行います。']);
  }
  const shouldDeploy = args.includes('--deploy');

  const electronBuilder = readJson('electron-builder.json');
  const hostingConfig = readJson('firebase.desktop-updates.json');
  const firebaserc = readJson('.firebaserc');
  if (!isRecord(electronBuilder) || !isRecord(hostingConfig) || !isRecord(firebaserc)) {
    fail(['設定ファイルの形式が不正です。']);
  }

  const feed = checkUpdateFeedConfig(electronBuilder, hostingConfig);
  if (!feed.ok) fail(feed.errors);

  const projects = isRecord(firebaserc.projects) ? firebaserc.projects : null;
  const projectId = typeof projects?.default === 'string' ? projects.default : '';
  if (!projectId) fail(['.firebaserc の projects.default がありません。']);

  const packageJson = readJson('package.json');
  if (!isRecord(packageJson) || typeof packageJson.version !== 'string') {
    fail(['package.json の version が読めません。']);
  }

  const ymlPath = path.join(repoRoot, 'release', 'latest.yml');
  if (!fs.existsSync(ymlPath)) {
    fail(['release/latest.yml がありません。Windows で npm run build:electron を先に実行してください。']);
  }

  const plan = planDesktopUpdateFiles({
    ymlText: fs.readFileSync(ymlPath, 'utf8'),
    expectedVersion: packageJson.version,
    availableNames: listReleaseFiles(),
  });
  const embeddedErrors = embeddedFeedErrors(feed.feedUrl);
  if (!plan.ok || embeddedErrors.length > 0) {
    fail([...plan.errors, ...embeddedErrors]);
  }

  stage(plan.files);
  console.log(`v${plan.version} の更新ファイルを desktop-updates/ に用意しました。`);
  for (const name of plan.files) console.log(`  ${name}`);
  console.log(`公開後の確認先: ${feed.feedUrl}latest.yml`);
  console.log('手順の全体は docs/desktop-updates.md にあります。');

  if (shouldDeploy) deploy(projectId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

main();
