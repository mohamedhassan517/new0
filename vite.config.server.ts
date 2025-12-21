import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  ssr: {
    noExternal: [
      "better-sqlite3",
      "mysql2",
    ],
  },
  build: {
    ssr: true,
    target: "node18",
    outDir: "dist/server",
    rollupOptions: {
      input: path.resolve(__dirname, "server/node-build.ts"), // your entry file
      external: [
        "fs",
        "path",
        "os",
        "net",
        "tls",
        "zlib",
        "crypto",
        "timers",
        "stream",
        "http",
        "https",
        "better-sqlite3",
        "mysql2",
      ],
      output: {
        format: "cjs", // use CommonJS for backend
        entryFileNames: "node-build.cjs",
      },
    },
  },
  optimizeDeps: {
    noDiscovery: true,
    include: [],
  },
});
