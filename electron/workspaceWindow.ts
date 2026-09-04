export const WORKSPACE_MIN_WINDOW_WIDTH = 1200;
export const COMPACT_CHAT_WINDOW_WIDTH = 420;
export const COMPACT_CHAT_MIN_HEIGHT = 720;

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getWorkspaceWindowBounds(
  currentBounds: WindowBounds,
  workArea: WindowBounds,
): WindowBounds {
  const width = Math.min(
    Math.max(currentBounds.width, WORKSPACE_MIN_WINDOW_WIDTH),
    workArea.width,
  );
  const height = Math.min(currentBounds.height, workArea.height);
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;

  return {
    x: clamp(currentBounds.x, workArea.x, maxX),
    y: clamp(currentBounds.y, workArea.y, maxY),
    width,
    height,
  };
}

export function getCompactChatWindowBounds(
  currentBounds: WindowBounds,
  workArea: WindowBounds,
): WindowBounds {
  const width = Math.min(COMPACT_CHAT_WINDOW_WIDTH, workArea.width);
  const height = Math.min(Math.max(currentBounds.height, COMPACT_CHAT_MIN_HEIGHT), workArea.height);
  return {
    x: workArea.x + workArea.width - width,
    y: clamp(currentBounds.y, workArea.y, workArea.y + workArea.height - height),
    width,
    height,
  };
}
