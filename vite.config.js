import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 主页部署在域名根路径：https://bitbat123.github.io/
export default defineConfig({
  base: '/',
  plugins: [react()],
});
