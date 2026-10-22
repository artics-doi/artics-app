// 同梱の更新ノートを先に出し、Firestore にしか無い過去の版を後ろへ足す。

const RELEASE_NOTE_HEADER = /^(\d{4}[/-]\d{2}[/-]\d{2})\s*[：:]\s*(v?\d+(?:\.\d+)+)(?:\s*[：:]\s*(.*))?$/;

function versionKey(line: string): string | null {
  const match = line.trim().match(RELEASE_NOTE_HEADER);
  if (!match?.[2]) return null;
  return match[2].replace(/^v/i, '');
}

function noteBlocks(text: string): string[] {
  const blocks: string[][] = [];
  let current: string[] | null = null;

  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (RELEASE_NOTE_HEADER.test(line.trim())) {
      if (current && current.some((part) => part.trim())) blocks.push(current);
      current = [line];
      continue;
    }
    if (!current) current = [];
    current.push(line);
  }

  if (current && current.some((part) => part.trim())) blocks.push(current);
  return blocks.map((parts) => parts.join('\n').trim()).filter(Boolean);
}

/** 同梱済みのバージョンは Firestore 側を捨て、同梱に無いブロックだけを末尾へ足す。 */
export function mergeReleaseNotes(bundled: string, remote: string): string {
  const bundledText = bundled.trim();
  const seenVersions = new Set<string>();

  for (const block of noteBlocks(bundledText)) {
    const version = versionKey(block.split('\n')[0] ?? '');
    if (version) seenVersions.add(version);
  }

  const extras: string[] = [];
  for (const block of noteBlocks(remote)) {
    const version = versionKey(block.split('\n')[0] ?? '');
    if (version) {
      if (seenVersions.has(version)) continue;
      seenVersions.add(version);
    } else if (bundledText.includes(block)) {
      continue;
    }
    extras.push(block);
  }

  if (extras.length === 0) return bundledText;
  if (!bundledText) return extras.join('\n\n');
  return `${bundledText}\n\n${extras.join('\n\n')}`;
}
