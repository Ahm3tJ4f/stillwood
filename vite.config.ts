import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    printWidth: 100,
    ignorePatterns: ["dist/**", "assets/**"],
  },
  lint: {
    plugins: ["typescript", "oxc", "unicorn"],
    ignorePatterns: ["dist/**", "assets/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
