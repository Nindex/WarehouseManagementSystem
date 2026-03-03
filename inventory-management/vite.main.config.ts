import { defineConfig } from 'vite'
import { builtinModules } from 'module'

export default defineConfig({
  define: {
    // 定义环境变量，打包后这些变量会被替换
    'MAIN_WINDOW_VITE_DEV_SERVER_URL': JSON.stringify(process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL || undefined),
    'MAIN_WINDOW_VITE_NAME': JSON.stringify(process.env.MAIN_WINDOW_VITE_NAME || 'main_window'),
  },
  build: {
    outDir: '.vite/build/main',
    lib: {
      entry: 'electron/main.ts',
      formats: ['cjs']
    },
    rollupOptions: {
      external: [
        ...builtinModules,
        'electron',
        'path',
        'fs',
        'better-sqlite3',
      ],
      output: {
        entryFileNames: 'index.js'
      }
    },
    // 开发模式下启用 watch，支持热重载
    watch: process.env.NODE_ENV === 'development' ? {} : null
  }
})

