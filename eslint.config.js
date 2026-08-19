// eslint.config.js
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "node_modules/", ".next/", "next-env.d.ts"] },
  ...tseslint.configs.recommended
);
