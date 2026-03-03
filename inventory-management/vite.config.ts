import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/pages': path.resolve(__dirname, './src/pages'),
      '@/utils': path.resolve(__dirname, './src/utils'),
      '@/store': path.resolve(__dirname, './src/store'),
      '@/types': path.resolve(__dirname, './src/types'),
    },
  },
  base: './', // 使用相对路径，确保打包后资源能正确加载
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000, // 提高警告阈值到 1MB
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
      output: {
        // 暂时禁用代码分割，将所有代码打包在一起，避免模块加载顺序问题
        // manualChunks: undefined,
      },
    },
    assetsDir: 'assets',
    // 启用代码压缩
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // 保留 console，方便调试
        drop_debugger: true,
      },
    },
  },
  server: {
    port: 3000,
    strictPort: false,
    host: 'localhost',
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      // 移除显式端口配置，让 Vite 自动分配 HMR 端口
    },
    watch: {
      usePolling: false,
      ignored: ['**/node_modules/**', '**/.git/**', '**/.vite/**'],
    },
    cors: true,
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
})
