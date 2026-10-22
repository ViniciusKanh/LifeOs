/**
 * Numeração de "capítulo" das seções do editor do Diário (Crônicas da
 * Jornada). Puramente visual: o título da seção continua sendo o texto
 * acessível, por isso o número fica aria-hidden.
 */
export function JournalChapterBadge({ chapter }: { chapter: string }) {
  return (
    <span
      aria-hidden
      className="shrink-0 inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1 rounded-md text-[10px] font-bold bg-cat-pink/10 text-cat-pink rpg:rounded-[3px] rpg:border rpg:border-rpg-border rpg:bg-rpg-bg rpg:text-rpg-gold-light rpg:font-pixel"
    >
      {chapter}
    </span>
  );
}
