import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "src/manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const css = manifest.styles.map(read).join("");
const js = manifest.scripts.map(read).join("");

let html = read("src/index.template.html");
if (!html.includes("/*__BUILD_STYLES__*/") || !html.includes("/*__BUILD_SCRIPTS__*/")) {
  throw new Error("模板缺少构建占位符");
}

html = html
  .replace("/*__BUILD_STYLES__*/", css)
  .replace(
    "/*__BUILD_SCRIPTS__*/",
    `(() => {\n  "use strict";\n\n${js}})();\n`
  );

const distDir = path.join(root, "dist");
fs.mkdirSync(distDir, { recursive: true });
const outPath = path.join(distDir, "index.html");
fs.writeFileSync(outPath, html, "utf8");

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`已生成 ${path.relative(root, outPath)}`);
console.log(`  CSS ${kb(Buffer.byteLength(css))} / ${manifest.styles.length} 个文件`);
console.log(`  JS  ${kb(Buffer.byteLength(js))} / ${manifest.scripts.length} 个文件`);
console.log(`  单文件 ${kb(Buffer.byteLength(html))}`);
