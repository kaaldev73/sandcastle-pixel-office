import { defineConfig } from 'vite';

// The 3D office lives in client/ and builds into dist/, which is committed so `python3 server.py`
// serves it without Node. In dev, `npm run dev` proxies the API to a running server.py.
export default defineConfig({
  root: 'client',
  base: '/',
  build: { outDir: '../dist', emptyOutDir: true, assetsDir: 'static', chunkSizeWarningLimit: 900 },
  // Keeping the page's Host header: server.py checks it against the Origin before running anything.
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8765', changeOrigin: false } } },
});
