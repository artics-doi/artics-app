// 通知ウィンドウ用のプリロードスクリプト
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('notificationAPI', {
  // メインウィンドウを開く
  openMainWindow: () => ipcRenderer.send('open-main-window'),

  // 通知ウィンドウを閉じる（IPC経由でメインプロセスから確実に閉じる）
  closeNotification: () => ipcRenderer.send('close-notification'),

  // 特定のチャットルームを開く
  openRoom: (roomId: string) => ipcRenderer.send('open-room', roomId),

  // 全ての通知をクリアしてウィンドウを閉じる
  clearAll: () => ipcRenderer.send('clear-all-notifications')
});
