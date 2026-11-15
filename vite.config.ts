import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: o build funciona em qualquer subpasta (GitHub Pages, Vercel, Netlify, Artifact)
export default defineConfig({
  base: './',
  plugins: [react()],
  assetsInclude: ['**/*.pbf'], // glifos do mapa: importados com ?inline e embutidos no bundle
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
