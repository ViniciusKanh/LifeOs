/**
 * Gera docs/PRIVACY.md e docs/TERMS.md a partir de apps/web/src/content/legal.ts
 * (fonte única do texto jurídico). Rode depois de alterar o conteúdo:
 *   node --experimental-strip-types scripts/generate-legal-docs.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const legal = await import(pathToFileURL(join(root, "apps/web/src/content/legal.ts")).href);

const esc = (s) => s.replace(/\|/g, "\\|");

function toMarkdown(doc, path) {
  const { CONTROLLER, LEGAL_VERSION, LEGAL_UPDATED_LABEL } = legal;
  const out = [
    `# ${doc.title} — ${CONTROLLER.product}`,
    "",
    `> Versão **${LEGAL_VERSION}** · Última atualização: ${LEGAL_UPDATED_LABEL}  `,
    `> Versão oficial exibida no app: ${CONTROLLER.site}${path}`,
    "",
    doc.summary,
    "",
    "## Sumário",
    "",
    ...doc.sections.map((s) => `- [${s.title}](#${s.id})`),
    "",
  ];
  for (const s of doc.sections) {
    out.push(`<a id="${s.id}"></a>`, "", `## ${s.title}`, "");
    for (const p of s.paragraphs ?? []) out.push(p, "");
    if (s.bullets?.length) out.push(...s.bullets.map((b) => `- ${b}`), "");
    if (s.table) {
      out.push(`| ${s.table.head.map(esc).join(" | ")} |`, `| ${s.table.head.map(() => "---").join(" | ")} |`);
      out.push(...s.table.rows.map((r) => `| ${r.map(esc).join(" | ")} |`), "");
    }
  }
  out.push("---", "", `_Arquivo gerado automaticamente a partir de \`apps/web/src/content/legal.ts\`. Não edite à mão._`, "");
  return out.join("\n");
}

mkdirSync(join(root, "docs"), { recursive: true });
writeFileSync(join(root, "docs/PRIVACY.md"), toMarkdown(legal.PRIVACY_POLICY, "/privacidade"));
writeFileSync(join(root, "docs/TERMS.md"), toMarkdown(legal.TERMS_OF_USE, "/termos"));
console.log("docs/PRIVACY.md e docs/TERMS.md atualizados.");
