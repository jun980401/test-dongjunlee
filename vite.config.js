import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            '/api': {
                target: 'https://naveropenapi.apigw.ntruss.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ''),
            },
            '/charge': {
                target: 'http://openapi.kepco.co.kr',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/charge/, ''),
            },
        },
    },
});
