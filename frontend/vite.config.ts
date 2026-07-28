import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const certPath = path.resolve(__dirname, '../certs');

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      define: {
        // This is just generic value for the GEMINI API key.
        // This is not used at all, and can be ignored!
        'process.env.API_KEY' : JSON.stringify('api-key-this-is-not-used-can-be-ignored!'),
      },
      server: {
        host: '0.0.0.0',
        port: 5174,
        strictPort: true,
        allowedHosts: 'all',
        https: fs.existsSync(path.join(certPath, 'cert.pem')) && fs.existsSync(path.join(certPath, 'key.pem')) ? {
          key: fs.readFileSync(path.join(certPath, 'key.pem')),
          cert: fs.readFileSync(path.join(certPath, 'cert.pem')),
        } : undefined,
        proxy: {
          '/api-proxy': 'http://localhost:5000',
          '/ws-proxy': { target: 'ws://localhost:5000', ws: true },
          '/api': 'http://localhost:5000',
        },
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
