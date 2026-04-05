import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
    plugins: [react()],
    build: {
        target: "chrome68",
    },
    optimizeDeps: {
        esbuildOptions: {
            target: "chrome68",
        },
    },
    server: {
        port: 3000,
        strictPort: true,
    },
    resolve: {
        dedupe: ["react", "react-dom"],
    },
})
