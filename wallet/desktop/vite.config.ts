import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              // snarkjs·circomlibjs 는 번들하지 않는다. 메인은 ESM 으로 빌드되는데 두 패키지가
              // 워커 스폰에 CJS 전역 __filename 을 쓰기 때문에 번들하면 런타임에
              // "__filename is not defined" 로 죽는다. node_modules 에서 그대로 로드시킨다.
              external: ['snarkjs', 'circomlibjs'],
            },
          },
        },
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer: process.env.NODE_ENV === 'test'
        // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
        ? undefined
        : {},
    }),
  ],
  // core 와 desktop 이 각각 react 를 해석해 두 사본이 번들되는 사고(Invalid hook call)를 막는 불변식 가드.
  // 호이스팅이 정상이면 no-op 이다.
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})
