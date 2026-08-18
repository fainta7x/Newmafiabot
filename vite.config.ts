import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const directVkEntry: Plugin = {
  name: "2la-direct-vk-entry",
  enforce: "pre",
  transform(code, id) {
    if (id.endsWith("/src/App.tsx")) {
      return code.replace(
        "./components/public/PublicJoinView.tsx",
        "./components/public/PublicJoinView.vk-direct.tsx",
      );
    }

    if (id.endsWith("/src/components/crm/EveningAnnouncementPanel.tsx")) {
      return code.replace(
        "./EveningVkCard.tsx",
        "./EveningVkCard.vk-direct.tsx",
      );
    }

    return null;
  },
};

// Keep a single Vite config. Vite resolves vite.config.js before vite.config.ts,
// so duplicate configs can silently make the TypeScript config ineffective.
export default defineConfig({
  plugins: [directVkEntry, react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: "all",
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
