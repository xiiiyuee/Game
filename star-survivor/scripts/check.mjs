import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "src/manifest.json"), "utf8"));

const failures = [];
const read = (relativePath) => {
  const full = path.join(root, relativePath);
  if (!fs.existsSync(full)) {
    failures.push(`缺少文件: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(full, "utf8");
};

const allSources = [...manifest.styles, ...manifest.scripts];
const duplicates = allSources.filter((item, index) => allSources.indexOf(item) !== index);
if (duplicates.length) failures.push(`manifest 重复项: ${[...new Set(duplicates)].join(", ")}`);

const css = manifest.styles.map(read).join("");
const js = manifest.scripts.map(read).join("");
const template = read("src/index.template.html");

if (!template.includes("/*__BUILD_STYLES__*/")) failures.push("模板缺少样式占位符");
if (!template.includes("/*__BUILD_SCRIPTS__*/")) failures.push("模板缺少脚本占位符");

try {
  new Function(js);
} catch (error) {
  failures.push(`合并后的 JS 语法错误: ${error.message}`);
}

for (const relativePath of manifest.scripts) {
  const source = read(relativePath);
  try {
    new Function(source);
  } catch (error) {
    failures.push(`JS 分区无法独立解析: ${relativePath}: ${error.message}`);
  }
}

const htmlPath = path.join(root, "index.html");
if (!fs.existsSync(htmlPath)) {
  failures.push("缺少构建产物 index.html");
} else {
  const html = fs.readFileSync(htmlPath, "utf8");
  if ((html.match(/<style>/g) || []).length !== 1) failures.push("产物应只有一个 <style>");
  if ((html.match(/<script>/g) || []).length !== 1) failures.push("产物应只有一个 <script>");
  if (html.includes("/*__BUILD_STYLES__*/") || html.includes("/*__BUILD_SCRIPTS__*/")) {
    failures.push("产物仍包含构建占位符");
  }
  if (!html.includes("(() => {\n  \"use strict\";")) failures.push("产物缺少统一 IIFE 包装");
}

if (failures.length) {
  console.error("检查失败：");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("检查通过");
console.log(`  样式 ${manifest.styles.length} 个，JS ${manifest.scripts.length} 个`);
console.log(`  CSS ${(Buffer.byteLength(css) / 1024).toFixed(1)} KB / JS ${(Buffer.byteLength(js) / 1024).toFixed(1)} KB`);
