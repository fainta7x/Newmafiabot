import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const directVkEntry = {
  name: '2la-direct-vk-entry',
  enforce: 'pre',
  transform(code, id) {
    if (id.endsWith('/src/App.tsx')) {
      return code.replace(
        './components/public/PublicJoinView.tsx',
        './components/public/PublicJoinView.vk-direct.tsx',
      );
    }
    if (id.endsWith('/src/components/crm/EveningAnnouncementPanel.tsx')) {
      return code.replace(
        "./EveningVkCard.tsx",
        "./EveningVkCard.vk-direct.tsx",
      );
    }
    return null;
  },
};

export default defineConfig({
  plugins: [directVkEntry, react(), tailwindcss()],
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
    exclude: [
      ...configDefaults.exclude,
    ],
  },
});