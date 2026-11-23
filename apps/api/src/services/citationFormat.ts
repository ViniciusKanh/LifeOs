/**
 * Formatação de referências (ABNT NBR 6023:2018, APA 7ª ed., BibTeX e RIS)
 * a partir SÓ dos campos conhecidos: campo ausente é omitido, nunca
 * preenchido com valor genérico. Texto puro (o destaque tipográfico do
 * periódico, exigido pelas normas, fica a cargo do editor de texto).
 */
import type { PaperAuthor } from "./researchProviders.js";

export interface CitablePaper {
  doi: string | null;
  title: string;
  authors: PaperAuthor[];
  year: number | null;
  venue: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  publisher: string | null;
  url: string | null;
  type: string | null;
}

export type CitationFormat = "abnt" | "apa" | "bibtex" | "ris";

const family = (a: PaperAuthor) => a.family ?? a.name.split(/\s+/).pop() ?? a.name;
const givenParts = (a: PaperAuthor) => (a.given ?? a.name.split(/\s+/).slice(0, -1).join(" ")).split(/[\s-]+/).filter(Boolean);
const initials = (a: PaperAuthor, sep: string) => givenParts(a).map((p) => `${p[0]!.toUpperCase()}.`).join(sep);
const MONTHS_ABNT = ["jan.", "fev.", "mar.", "abr.", "maio", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];

/** ABNT: SOBRENOME, Iniciais; até 3 autores (mais que isso: primeiro + et al.). */
function abnt(p: CitablePaper, accessed: Date): string {
  const names = p.authors.length > 3 ? [p.authors[0]!] : p.authors;
  const authorPart = names.length
    ? names.map((a) => `${family(a).toUpperCase()}, ${initials(a, " ")}`.trim().replace(/,\s*$/, "")).join("; ") + (p.authors.length > 3 ? " et al." : "")
    : "";
  const parts: string[] = [];
  if (authorPart) parts.push(authorPart.endsWith(".") ? authorPart : `${authorPart}.`);
  parts.push(`${p.title.replace(/\.$/, "")}.`);
  const venueBits: string[] = [];
  if (p.venue) venueBits.push(p.venue);
  if (p.volume) venueBits.push(`v. ${p.volume}`);
  if (p.issue) venueBits.push(`n. ${p.issue}`);
  if (p.pages) venueBits.push(`p. ${p.pages}`);
  if (p.year) venueBits.push(String(p.year));
  if (venueBits.length) parts.push(`${venueBits.join(", ")}.`);
  if (p.doi) parts.push(`DOI: ${p.doi}.`);
  const link = p.doi ? `https://doi.org/${p.doi}` : p.url;
  if (link) parts.push(`Disponível em: ${link}. Acesso em: ${accessed.getDate()} ${MONTHS_ABNT[accessed.getMonth()]} ${accessed.getFullYear()}.`);
  return parts.join(" ");
}

/** APA 7: até 20 autores, "&" antes do último. */
function apa(p: CitablePaper): string {
  const list = p.authors.slice(0, 20).map((a) => `${family(a)}, ${initials(a, " ")}`.trim().replace(/,\s*$/, ""));
  const authorPart = list.length === 0 ? "" : list.length === 1 ? list[0]! : `${list.slice(0, -1).join(", ")}, & ${list[list.length - 1]}`;
  const parts: string[] = [];
  if (authorPart) parts.push(authorPart.endsWith(".") ? authorPart : `${authorPart}.`);
  parts.push(`(${p.year ?? "s.d."}).`);
  parts.push(`${p.title.replace(/\.$/, "")}.`);
  if (p.venue) {
    let v = p.venue;
    if (p.volume) v += `, ${p.volume}`;
    if (p.issue) v += `(${p.issue})`;
    if (p.pages) v += `, ${p.pages}`;
    parts.push(`${v}.`);
  }
  if (p.doi) parts.push(`https://doi.org/${p.doi}`);
  else if (p.url) parts.push(p.url);
  return parts.join(" ");
}

const bibEscape = (s: string) => s.replace(/[{}]/g, "").replace(/([&%$#_])/g, "\\$1");

export function citeKey(p: CitablePaper): string {
  const fam = p.authors[0] ? family(p.authors[0]) : "anon";
  const word = p.title.split(/\s+/).find((w) => w.length > 3) ?? "artigo";
  return `${fam}${p.year ?? ""}${word}`.normalize("NFD").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function bibtex(p: CitablePaper): string {
  const kind = p.type === "proceedings-article" || /conference|proceedings/i.test(p.venue ?? "") ? "inproceedings" : "article";
  const f: Array<[string, string | null]> = [
    ["title", p.title],
    ["author", p.authors.length ? p.authors.map((a) => `${family(a)}, ${a.given ?? givenParts(a).join(" ")}`.replace(/,\s*$/, "")).join(" and ") : null],
    [kind === "article" ? "journal" : "booktitle", p.venue],
    ["year", p.year ? String(p.year) : null],
    ["volume", p.volume],
    ["number", p.issue],
    ["pages", p.pages ? p.pages.replace("-", "--") : null],
    ["publisher", p.publisher],
    ["doi", p.doi],
    ["url", p.doi ? `https://doi.org/${p.doi}` : p.url],
  ];
  return `@${kind}{${citeKey(p)},\n${f.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${bibEscape(v!)}}`).join(",\n")}\n}`;
}

function ris(p: CitablePaper): string {
  const lines: string[] = [`TY  - ${p.type === "proceedings-article" ? "CPAPER" : "JOUR"}`];
  for (const a of p.authors) lines.push(`AU  - ${family(a)}, ${a.given ?? givenParts(a).join(" ")}`.replace(/,\s*$/, ""));
  lines.push(`TI  - ${p.title}`);
  if (p.venue) lines.push(`JO  - ${p.venue}`);
  if (p.year) lines.push(`PY  - ${p.year}`);
  if (p.volume) lines.push(`VL  - ${p.volume}`);
  if (p.issue) lines.push(`IS  - ${p.issue}`);
  if (p.pages) {
    const [sp, ep] = p.pages.split("-");
    lines.push(`SP  - ${sp}`);
    if (ep) lines.push(`EP  - ${ep}`);
  }
  if (p.publisher) lines.push(`PB  - ${p.publisher}`);
  if (p.doi) lines.push(`DO  - ${p.doi}`);
  if (p.doi || p.url) lines.push(`UR  - ${p.doi ? `https://doi.org/${p.doi}` : p.url}`);
  lines.push("ER  - ");
  return lines.join("\n");
}

export function formatCitation(p: CitablePaper, format: CitationFormat, accessed = new Date()): string {
  if (format === "abnt") return abnt(p, accessed);
  if (format === "apa") return apa(p);
  if (format === "bibtex") return bibtex(p);
  return ris(p);
}
