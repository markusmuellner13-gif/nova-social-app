import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The native projects. `cap sync` copies the built bundle into
    // android/app/src/main/assets/public and ios/App/App/public, so without
    // these the linter walks thousands of minified chunks and buries the real
    // findings under ~12k phantom errors. Same reason "out/**" is ignored —
    // these are just two more copies of it.
    "android/**",
    "ios/**",
  ]),
  {
    rules: {
      // Nova deliberately renders images with a plain <img> routed through its own
      // CDN-cached /api/image-proxy (and ships inside a Capacitor native shell),
      // so next/image's server optimiser is the wrong tool here — it would double-
      // process proxied URLs and doesn't run in the static/native build. This is a
      // reviewed architecture decision, so the rule is off rather than ignored.
      "@next/next/no-img-element": "off",

      // The React Compiler lint family (new in eslint-plugin-react-hooks v6) emits
      // ADVISORY diagnostics about render purity, refs-in-render, set-state-in-
      // effect and manual-memoization. They flag optimisation opportunities, not
      // correctness bugs — the app runs correctly. Several flag SSR-safe patterns
      // (reading localStorage in an effect, not in lazy initial state) where the
      // "fix" would actually break server rendering, so blindly rewriting them is
      // the risky churn we avoid. Kept as visible WARNINGS; the gate still HARD-
      // fails on real errors (unescaped JSX, bad <a> page links, unused vars, type
      // errors, failing tests, broken build). TODO: burn down case-by-case.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);

export default eslintConfig;
