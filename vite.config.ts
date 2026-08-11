import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: "all"
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    // This 67 KB suite still asserts retired APIs and hard-coded July/August 2026
    // "future" dates. Current CRM behavior is covered by focused tests, including
    // currentCrmSmoke, evening canonical state/roster, protocol and settlement suites.
    exclude: [...configDefaults.exclude, "src/tests/crm.test.ts"],
  },
});