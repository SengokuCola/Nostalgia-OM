// Modified by SengokuCola for the Caduceus for OM-3 fork.
import { defineConfig } from 'vite';

// base './' = relative asset URLs, so the same build works at a domain root or under a sub-path
// such as https://example.com/caduceus/ (no rebuild needed).
export default defineConfig({
  base: './',
  esbuild: { legalComments: 'inline' },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        banner: '/*! Modified by SengokuCola for the Caduceus for OM-3 fork. Apache-2.0. See LICENSE and NOTICE. */',
      },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 60000 },
} as any);
