import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  /**
   * ⚠️ **必须用相对基路径**（原来是默认的 `'/'`，即"写死根目录"）。
   *
   * 线上要挂在 `https://zjhxbb.xyz/刘看山/` 这种**子路径**下（和同服务器的
   * 「点废成金」一个路子：磁盘目录镜像 URL 结构）。
   * 用 `'./'` 两种场景都对：
   *   · 本地 dev：`http://127.0.0.1:5273/` → `./assets/x.js` 解析成 `/assets/x.js`
   *   · 线上：`https://zjhxbb.xyz/刘看山/` → `/刘看山/assets/x.js`
   * 而且以后换目录也不用改配置。
   */
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5273,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
