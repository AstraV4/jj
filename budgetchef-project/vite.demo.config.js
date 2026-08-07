// Build "démo" : un seul bundle JS (imports dynamiques inclus) + un seul CSS,
// que l'on inline ensuite dans un unique fichier HTML autonome.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-demo',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
