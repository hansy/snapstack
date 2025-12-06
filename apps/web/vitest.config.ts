import { defineConfig } from 'vitest/config';
import viteReact from '@vitejs/plugin-react';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    plugins: [
        viteTsConfigPaths({
            projects: ['./tsconfig.json'],
        }),
        viteReact(),
    ],
    test: {
        environment: 'jsdom',
        globals: true,
        server: {
            deps: {
                inline: ['@tanstack/react-router', '@tanstack/router-core', '@tanstack/history', 'tiny-warning', 'tiny-invariant'],
            },
        },
    },
});
