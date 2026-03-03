import type { ForgeConfig } from '@electron-forge/shared-types'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    asarUnpack: ['**/*.node', '**/node_modules/better-sqlite3/**', '**/node_modules/bindings/**', '**/node_modules/file-uri-to-path/**', '**/better-sqlite3/**/node_modules/bindings/**'],
    extraResource: ['database']
  },
  rebuildConfig: {
    onlyModules: ['better-sqlite3'],
    force: false,
    buildFromSource: false
  },
  makers: [
    new MakerZIP({}, ['win32']),
    new MakerDeb({}),
    new MakerRpm({})
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'electron/main.ts', config: 'vite.main.config.ts' },
        { entry: 'electron/preload.ts', config: 'vite.preload.config.ts' }
      ],
      renderer: [
        { name: 'main_window', config: 'vite.config.ts' }
      ]
    }),
    new AutoUnpackNativesPlugin()
  ]
}

export default config

