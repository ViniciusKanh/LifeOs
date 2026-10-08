/**
 * Gera docs/PRIVACY.md, docs/TERMS.md e a página de licença do instalador do
 * Desktop (apps/desktop/src-tauri/installer/license.rtf) a partir de
 * apps/web/src/content/legal.ts (fonte única do texto jurídico). Rode depois de alterar o conteúdo:
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

/**
 * RTF só com ASCII: acentos viram \\uN? — o NSIS (RichEdit) exibe certo em
 * qualquer idioma do Windows, sem depender de BOM/codificação do arquivo.
 */
const rtfEsc = (s) =>
  [...s.replace(/\*\*(.+?)\*\*/g, "$1")]
    .map((ch) => {
      const c = ch.codePointAt(0);
      if (ch === "\\" || ch === "{" || ch === "}") return `\\${ch}`;
      if (c < 128) return ch;
      if (c > 0xffff) return "?";
      return `\\u${c > 32767 ? c - 65536 : c}?`;
    })
    .join("");

function toRtfBody(doc) {
  const out = [`{\\pard\\sb240\\sa120\\b\\fs28 ${rtfEsc(doc.title)}\\b0\\par}`, `{\\pard\\sa120 ${rtfEsc(doc.summary)}\\par}`];
  for (const s of doc.sections) {
    out.push(`{\\pard\\sb180\\sa80\\b ${rtfEsc(s.title)}\\b0\\par}`);
    for (const p of s.paragraphs ?? []) out.push(`{\\pard\\sa100 ${rtfEsc(p)}\\par}`);
    for (const b of s.bullets ?? []) out.push(`{\\pard\\li280\\fi-200\\sa60 \\u8226? ${rtfEsc(b)}\\par}`);
    if (s.table) {
      out.push(`{\\pard\\sa60\\b ${rtfEsc(s.table.head.join(" | "))}\\b0\\par}`);
      for (const r of s.table.rows) out.push(`{\\pard\\li200\\sa60 ${rtfEsc(r.join(" | "))}\\par}`);
    }
  }
  return out.join("\n");
}

function toInstallerRtf() {
  const { CONTROLLER, LEGAL_VERSION, LEGAL_UPDATED_LABEL } = legal;
  const intro = [
    `{\\pard\\sa120\\b\\fs30 ${CONTROLLER.product} \\u8212? Termos de Uso e Pol\\u237?tica de Privacidade\\b0\\fs20\\par}`,
    `{\\pard\\sa120 ${rtfEsc(`Versão ${LEGAL_VERSION} · Atualizado em ${LEGAL_UPDATED_LABEL}. Ao instalar e usar o LifeOS Desktop você concorda com os documentos abaixo, também disponíveis em ${CONTROLLER.site}/termos e ${CONTROLLER.site}/privacidade.`)}\\par}`,
    `{\\pard\\sa120 ${rtfEsc("O aplicativo para Windows abre o LifeOS publicado, como um navegador dedicado: seus dados ficam na sua conta (isolados dos demais usuários), o login usa um cookie de sessão protegido, nenhuma chave de serviço é guardada no computador e o app não coleta teclas digitadas, documentos ou capturas de tela.")}\\par}`,
  ];
  return [
    "{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fswiss Segoe UI;}}\\viewkind4\\f0\\fs20",
    ...intro,
    toRtfBody(legal.TERMS_OF_USE),
    toRtfBody(legal.PRIVACY_POLICY),
    "}",
    "",
  ].join("\n");
}

mkdirSync(join(root, "docs"), { recursive: true });
writeFileSync(join(root, "docs/PRIVACY.md"), toMarkdown(legal.PRIVACY_POLICY, "/privacidade"));
writeFileSync(join(root, "docs/TERMS.md"), toMarkdown(legal.TERMS_OF_USE, "/termos"));
mkdirSync(join(root, "apps/desktop/src-tauri/installer"), { recursive: true });
writeFileSync(join(root, "apps/desktop/src-tauri/installer/license.rtf"), toInstallerRtf());
console.log("docs/PRIVACY.md, docs/TERMS.md e installer/license.rtf atualizados.");
