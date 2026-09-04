export const MIN_DESKTOP_ROOM_PANE_WIDTH = 260;
export const MAX_DESKTOP_ROOM_PANE_WIDTH = 760;

const MIN_DESKTOP_CHAT_PANE_WIDTH = 360;
const DESKTOP_ROOM_PANE_RESIZER_WIDTH = 8;
const DESKTOP_SIDE_PANEL_RESERVED_WIDTH = 300;

export function getDefaultDesktopRoomPaneWidth(viewportWidth: number): number {
  if (viewportWidth <= 1280) return 280;
  return Math.round(Math.min(Math.max(viewportWidth * 0.25, 330), 424));
}

export function getDesktopRoomPaneMaxWidth(
  containerWidth: number,
  sidePanelOpen: boolean
): number {
  const reservedWidth = MIN_DESKTOP_CHAT_PANE_WIDTH
    + DESKTOP_ROOM_PANE_RESIZER_WIDTH
    + (sidePanelOpen ? DESKTOP_SIDE_PANEL_RESERVED_WIDTH : 0);

  return Math.max(
    MIN_DESKTOP_ROOM_PANE_WIDTH,
    Math.min(MAX_DESKTOP_ROOM_PANE_WIDTH, Math.floor(containerWidth - reservedWidth))
  );
}

export function clampDesktopRoomPaneWidth(
  requestedWidth: number,
  containerWidth: number,
  sidePanelOpen: boolean
): number {
  const maxWidth = getDesktopRoomPaneMaxWidth(containerWidth, sidePanelOpen);
  return Math.round(Math.min(Math.max(requestedWidth, MIN_DESKTOP_ROOM_PANE_WIDTH), maxWidth));
}
