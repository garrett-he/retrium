import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: [
            { find: "@", replacement: path.resolve(__dirname, "src") },
            {
                find: /\.(svg|png|jpg|jpeg|gif|ico)$/,
                replacement: path.resolve(__dirname, "src/__mocks__/fileMock.ts"),
            },
        ],
    },
    test: {
        globals: true,
        environment: "jsdom",
        setupFiles: ["./src/test-setup.ts"],
        exclude: ["**/node_modules/**", "**/dist/**", "**/copier-rust-tauri/**"],
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts", "src/**/*.tsx"],
            exclude: ["src/**/*.d.ts", "src/main.tsx", "src/types/**", "src/__mocks__/**"],
            thresholds: {
                branches: 80,
                functions: 80,
                lines: 80,
                statements: 80,
            },
        },
    },
});
