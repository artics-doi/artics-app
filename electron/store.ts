// 設定ストア（config.json 永続化）。main.ts から機械的に移動（挙動変更なし）。

import { app } from 'electron';
import path from 'path';
import fs from 'fs';

// 設定ストアの型
export interface StoreSchema {
  notificationSettings: {
    enableNotifications: boolean;
    showMessageContent: boolean;
    notifyActiveRoom: boolean;
  };
  alwaysOnTop: boolean;
  // アプリのテーマ（タイトルバーの明暗をOSに連動させるために保持）
  theme: 'light' | 'dark';
}

// シンプルな設定ストア実装
export class SimpleStore {
  private filePath: string;
  private data: StoreSchema;
  private defaults: StoreSchema = {
    notificationSettings: {
      enableNotifications: true,
      showMessageContent: true,
      notifyActiveRoom: false
    },
    alwaysOnTop: false,
    theme: 'light'
  };

  constructor() {
    const userDataPath = app.getPath('userData');
    this.filePath = path.join(userDataPath, 'config.json');
    this.data = this.load();
  }

  private load(): StoreSchema {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(content);
        return {
          ...this.defaults,
          ...parsed,
          notificationSettings: {
            ...this.defaults.notificationSettings,
            ...parsed.notificationSettings
          }
        };
      }
    } catch (error) {
      console.error('設定ファイル読み込みエラー:', error);
    }
    return { ...this.defaults };
  }

  private save(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('設定ファイル書き込みエラー:', error);
    }
  }

  get<K extends keyof StoreSchema>(key: K): StoreSchema[K] {
    return this.data[key];
  }

  set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void {
    this.data[key] = value;
    this.save();
  }
}
