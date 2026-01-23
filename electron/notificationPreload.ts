// 通知ウィンドウ用のプリロードスクリプト
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('notificationAPI', {
  openMainWindow: () => ipcRenderer.send('open-main-window')
});
