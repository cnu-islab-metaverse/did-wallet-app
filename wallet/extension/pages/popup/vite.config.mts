import { resolve } from 'node:path';
import { withPageConfig } from '@extension/vite-config';

const rootDir = resolve(import.meta.dirname);
const srcDir = resolve(rootDir, 'src');

export default withPageConfig({
  resolve: {
    alias: {
      '@src': srcDir,
      '@shared': resolve(rootDir, 'shared-src'),
      'scheduler': resolve(srcDir, 'scheduler-polyfill.ts'),
    },
    preserveSymlinks: true,
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  publicDir: resolve(rootDir, 'public'),
  server: {
    port: 20250,
    hmr: {
      port: 20250,
    },
  },
  build: {
    outDir: resolve(rootDir, '..', '..', 'dist', 'popup'),
    rollupOptions: {
      external: ['chrome'],
      onwarn(warning, warn) {
        // scheduler 관련 경고는 무시
        if (warning.code === 'UNRESOLVED_IMPORT' && 
            'source' in warning && warning.source === 'scheduler') {
          return;
        }
        warn(warning);
      },
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom']
        }
      }
    },
  },
});
