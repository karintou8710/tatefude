import { defineConfig } from "tsdown";

// react と tatefude は peer なので束ねない (tsdown が既定で外部化する)
export default defineConfig({
  entry: "src/index.ts",
  format: "esm",
  dts: true,
  clean: true,
  sourcemap: true,
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
