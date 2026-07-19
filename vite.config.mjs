import { defineConfig } from 'vite';

// Mirror of the blackjack app's config: Vite is used ONLY to produce a static
// `dist/` for Capacitor. The app itself is a zero-framework, no-bundler set of
// ordered <script defer> IIFE modules under public/js/poker/, so there is no
// entry to transform here — Vite just copies public/ verbatim and emits dist/.
export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist'
  }
});
