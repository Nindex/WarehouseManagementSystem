import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: '.vite/build/preload',
    lib: {
      entry: 'electron/preload.ts',
      formats: ['cjs']
    },
    rollupOptions: {
      external: ['electron'],
      output: {
        entryFileNames: 'index.js'
      }
    },
    // 开发模式下启用 watch，支持热重载
    watch: process.env.NODE_ENV === 'development' ? {} : null
  }
})

