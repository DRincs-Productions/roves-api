import { defineConfig } from "tsup";

export default defineConfig({
    target: "es2022",
    entry: {
        core: "src/core.ts",
        process: "src/process.ts",
        steam: "src/steam.ts",
        cache: "src/cache.ts",
    },
    format: ["cjs", "esm"],
    dts: true,
    treeshake: true,
    clean: true,
    minify: true,
    bundle: true,
    skipNodeModulesBundle: false,
    sourcemap: true,
    outExtension({ format }) {
        return {
            js: format === "esm" ? ".mjs" : ".cjs",
        };
    },
});
