import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const chatPage = readFileSync(resolve(process.cwd(), 'src/pages/Chat.tsx'), 'utf8');
const chatStyles = readFileSync(resolve(process.cwd(), 'src/pages/Chat.module.css'), 'utf8');
const desktopRoomPane = readFileSync(resolve(process.cwd(), 'src/components/desktop/DesktopRoomPane.tsx'), 'utf8');
const schedulePage = readFileSync(resolve(process.cwd(), 'src/pages/Schedule.tsx'), 'utf8');
const scheduleStyles = readFileSync(resolve(process.cwd(), 'src/pages/Schedule.module.css'), 'utf8');
const processLayout = readFileSync(resolve(process.cwd(), 'src/pages/process/ProcessLayout.tsx'), 'utf8');
const processStyles = readFileSync(resolve(process.cwd(), 'src/pages/process/ProcessLayout.module.css'), 'utf8');

describe('shared desktop room pane width', () => {
  it('uses the same persisted resize hook on chat, schedule, and process management', () => {
    expect(chatPage).toMatch(/useDesktopRoomPaneResize\(chatContainerRef, desktopSidePanelOpen\)/);
    expect(schedulePage).toMatch(/useDesktopRoomPaneResize\(scheduleContainerRef, false\)/);
    expect(processLayout).toMatch(/useDesktopRoomPaneResize\(processContainerRef, false\)/);
  });

  it('gives the schedule sidebar the shared width variable and resize boundary', () => {
    expect(scheduleStyles).toMatch(
      /grid-template-columns:\s*var\(--desktop-room-pane-width, 330px\) 8px minmax\(0, 1fr\)/,
    );
    expect(scheduleStyles).toMatch(/\.sidebarResizeHandle\s*\{[^}]*cursor:\s*col-resize/s);
  });

  it('gives process management the shared sidebar width and chat workspace controls', () => {
    expect(processStyles).toMatch(
      /grid-template-columns:\s*var\(--desktop-room-pane-width, 330px\) 8px minmax\(0, 1fr\)/,
    );
    expect(processStyles).toMatch(/\.sidebarResizeHandle\s*\{[^}]*cursor:\s*col-resize/s);
    expect(processLayout).toMatch(/チャット一覧と工程管理メニュー/);
    expect(processLayout).toMatch(/工程管理（Beta）/);
    expect(processLayout).toMatch(/visibleRooms\.map/);
  });

  it('opens rooms inside schedule and process panes while keeping full chat navigation on the chat tab', () => {
    expect(chatPage).toMatch(/embeddedRoomId\?: string/);
    expect(chatPage).toMatch(/isEmbedded \? styles\.embeddedChatMainPane/);
    expect(schedulePage).toMatch(/onClick=\{\(\) => setEmbeddedRoomId\(room\.id\)\}/);
    expect(schedulePage).toMatch(/<Chat\s+embeddedRoomId=\{embeddedRoomId\}/s);
    expect(processLayout).toMatch(/onClick=\{\(\) => setEmbeddedRoomId\(room\.id\)\}/);
    expect(processLayout).toMatch(/<Chat\s+embeddedRoomId=\{embeddedRoomId\}/s);
    expect(schedulePage).toMatch(/onClick=\{\(\) => navigate\('\/chat'\)\}/);
    expect(processLayout).toMatch(/onClick=\{\(\) => navigate\('\/chat'\)\}/);
  });

  it('keeps an explicit room-list return action visible inside embedded chat panes', () => {
    expect(chatPage).toMatch(/aria-label=\{isEmbedded \? 'チャット一覧へ戻る' : '戻る'\}/);
    expect(chatPage).toMatch(/isEmbedded \? 'チャット一覧' : '戻る'/);
    expect(chatStyles).toMatch(
      /\.embeddedChatMainPane > \.embeddedHeader \.backButton\s*\{[^}]*display:\s*inline-flex/s,
    );
  });

  it('marks compact workspace navigation for window expansion', () => {
    expect(chatPage).toMatch(/onOpenNewChat=\{\(\) => setDesktopNewChatOpen\(true\)\}\s+compactMode/s);
    expect(desktopRoomPane).toMatch(/await window\.electronAPI\?\.expandToWorkspace\?\.\(\)/);
    expect(desktopRoomPane).toMatch(/if \(await waitForWorkspaceViewport\(\)\) navigate\(path\)/);
    expect(desktopRoomPane).toMatch(
      /compactMode && <span className=\{styles\.desktopWorkspaceHint\}>画面を広げて開きます<\/span>/,
    );
  });
});
