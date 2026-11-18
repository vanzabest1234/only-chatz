import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The single-file build behind `public/only-chatz.html`: one bundle and one stylesheet, which
// web/scripts/single-file.mjs then folds into a single document. Kept apart from vite.config.js
// on purpose — the dev server's front-door rewrite and API proxy have no part in a file that is
// opened on its own.
export default defineConfig({
  plugins: [react()],
  base: './',
  // Tells main.jsx to leave the address bar alone: this file has its own address.
  define: { 'import.meta.env.VITE_SINGLE_FILE': '"1"' },
  build: {
    // The out dir is passed by web/scripts/single-file.mjs as a temp path outside this
    // directory: anything written inside web/ is watched by the dev server and reloads the room.
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    // iife, not esm: a module script is blocked when the file is opened straight from disk.
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
})
