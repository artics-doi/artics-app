import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const chatStyles = readFileSync(resolve(process.cwd(), 'src/pages/Chat.module.css'), 'utf8');

function declarationBlock(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = chatStyles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? '';
}

describe('desktop room information layout', () => {
  it('keeps variable-height cards from shrinking and overlapping following cards', () => {
    expect(declarationBlock('.desktopInfoCard')).toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it('keeps the room information header outside the scroll shrink calculation', () => {
    expect(declarationBlock('.desktopInfoPaneHeader')).toMatch(/flex:\s*0\s+0\s+auto/);
  });
});

describe('compact Electron chat list layout', () => {
  it('shows the desktop room pane as the full compact workspace', () => {
    const compactPane = declarationBlock('.electronCompactChatList .desktopRoomPane');
    expect(compactPane).toMatch(/width:\s*100%/);
    expect(compactPane).toMatch(/display:\s*flex/);
    expect(compactPane).toMatch(/overflow:\s*hidden/);
  });

  it('keeps the room collection as the only scrolling region', () => {
    const compactRoomList = declarationBlock('.electronCompactChatList .desktopRoomList');
    expect(compactRoomList).toMatch(/flex:\s*1/);
    expect(compactRoomList).toMatch(/overflow-y:\s*auto/);
  });
});
