import path from "node:path";
import electron from "vite-plugin-electron";
import vue from "@vitejs/plugin-vue";

export default {
    plugins: [
        electron({
                entry: [
                    path.resolve(__dirname, "electron/index.ts"),
                    path.resolve(__dirname, "electron/preload.ts")
                ]
            }
        ),
        vue()
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src")
        }
    }
};
