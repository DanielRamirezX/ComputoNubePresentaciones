import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(root, "src");
const templatePath = path.join(srcDir, "template.html");
const outputPath = path.join(root, "index.html");

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function listFiles(dir, extension) {
  try {
    const names = await fs.readdir(dir);
    return names
      .filter((name) => name.toLowerCase().endsWith(extension))
      .sort((a, b) => a.localeCompare(b, "en"))
      .map((name) => path.join(dir, name));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readOptionalFiles(files) {
  return Promise.all(files.map(readText));
}

function validateSlides(slideMarkup) {
  const ids = [];
  const idPattern = /<section\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = idPattern.exec(slideMarkup))) ids.push(match[1]);

  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) {
    throw new Error(`Ids de diapositiva duplicados: ${[...new Set(duplicates)].join(", ")}`);
  }

  const slideBlocks = slideMarkup.match(/<section\b[\s\S]*?<\/section>/gi) ?? [];
  slideBlocks.forEach((block) => {
    if (!/<aside\b[^>]*class\s*=\s*["'][^"']*\bnotes\b[^"']*["'][^>]*>/i.test(block)) {
      const id = block.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1] ?? "(sin id)";
      console.warn(`Advertencia: la diapositiva ${id} no tiene <aside class="notes">.`);
    }
  });

  return ids.length;
}

const template = await readText(templatePath);
const sectionCss = await listFiles(path.join(srcDir, "css", "sections"), ".css");
const sectionJs = await listFiles(path.join(srcDir, "js", "sections"), ".js");
const slideFiles = await listFiles(path.join(srcDir, "slides"), ".html");

const cssFiles = [
  path.join(srcDir, "css", "base.css"),
  path.join(srcDir, "css", "components.css"),
  ...sectionCss
];
const jsFiles = [
  path.join(srcDir, "config.js"),
  path.join(srcDir, "js", "deck.js"),
  ...sectionJs
];

const slides = (await readOptionalFiles(slideFiles)).join("\n\n");

// Resolve explícitamente los archivos opcionales para que una sección incompleta no detenga el build.
async function existingFiles(files) {
  const result = [];
  for (const file of files) {
    try {
      await fs.access(file);
      result.push(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return result;
}

const resolvedCss = (await existingFiles(cssFiles));
const resolvedJs = (await existingFiles(jsFiles));
const resolvedStyles = (await readOptionalFiles(resolvedCss)).join("\n\n");
const resolvedScripts = (await readOptionalFiles(resolvedJs)).join("\n\n");
const slideCount = validateSlides(slides);

const built = template
  .replace("<!-- @styles -->", `<style>\n${resolvedStyles}\n</style>`)
  .replace("<!-- @slides -->", slides)
  .replace("<!-- @scripts -->", `<script>\n${resolvedScripts}\n</script>`);

await fs.writeFile(outputPath, built, "utf8");
console.log(`Construcción completa: ${slideCount} diapositiva${slideCount === 1 ? "" : "s"}.`);
