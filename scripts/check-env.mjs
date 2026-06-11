import fs from 'node:fs';
import path from 'node:path';

const requiredKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_VAPID_KEY',
];

const placeholderPattern = /^(YOUR_|your-|your_|change-me|TODO|)$/i;

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const content = fs.readFileSync(filePath, 'utf8');
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        if (separatorIndex === -1) return [line, ''];
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
        return [key, value];
      }),
  );
}

const cwd = process.cwd();
const envFiles = ['.env.local', '.env'].map((fileName) => path.join(cwd, fileName));
const fileEnv = Object.assign({}, ...envFiles.map(parseEnvFile));
const missing = [];

for (const key of requiredKeys) {
  const value = process.env[key] ?? fileEnv[key];
  if (!value || placeholderPattern.test(value)) {
    missing.push(key);
  }
}

if (missing.length > 0) {
  console.error(`Firebase env is missing or still a placeholder: ${missing.join(', ')}`);
  console.error('Set real values in chat-app/.env or the shell environment before building.');
  process.exit(1);
}
