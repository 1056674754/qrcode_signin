import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {execFileSync} from 'node:child_process';
import {sentryVitePlugin} from '@sentry/vite-plugin';
import {sourceRelease} from './scripts/private-artifacts.mjs';

export default defineConfig(({command,mode}) => {
  const production=command==='build' && mode==='production';
  if(command==='build' && !production) throw new Error('Only production release builds are supported');
  if(production && (process.env.SENTRY_AUTH_TOKEN || process.env.VITE_SENTRY_AUTH_TOKEN)) throw new Error('Build must run without upload credentials');
  const release=production?sourceRelease(__dirname,execFileSync('git',['rev-parse','HEAD'],{cwd:__dirname,encoding:'utf8'}).trim(),process.env):'';
  return {
  define: {__SENTRY_RELEASE__:JSON.stringify(release)},
  build: {sourcemap:production?'hidden':false},
  plugins: [react(),...(production?[sentryVitePlugin({authToken:'',url:'https://sentry.suisqp.cn',org:'sentry',project:'suislink-qrcode-signin-web',telemetry:false,silent:true,release:{name:release,create:false,finalize:false,inject:false},errorHandler:error=>{throw error;}})]:[])],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      // 与生产 nginx 一致：域名校验文件走 PocketBase（pb_hooks/ww_verify.pb.js）
      '^/WW_verify_[^/]+\\.txt': {
        target: process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090',
        changeOrigin: true,
      },
      '/_': {
        target: process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090',
        changeOrigin: true,
      },
    },
  },
  };
});
