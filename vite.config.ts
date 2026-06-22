import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/popup',
  base: './',
  build: {
    outDir: '../../dist/popup',
    emptyOutDir: true,
  },
});
