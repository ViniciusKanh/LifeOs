/**
 * Conteudo curado de proverbios e versiculos para o Diario -- "frase do dia"
 * de reflexao, no espirito de uma capa de jornal com uma citacao de
 * abertura. NAO e dado do usuario nem gerado por IA: e conteudo fixo,
 * selecionado de forma deterministica a partir da data (mesma frase o dia
 * todo, troca so a meia-noite), entao nunca e preciso persistir nada nem
 * chamar o Gemini pra isso.
 */

export type DailyWisdomKind = "versiculo" | "proverbio";

export interface DailyWisdom {
  text: string;
  source: string;
  kind: DailyWisdomKind;
}

export const DAILY_WISDOM: DailyWisdom[] = [
  { kind: "versiculo", text: "Tudo tem o seu tempo determinado, e ha tempo para todo proposito debaixo do ceu.", source: "Eclesiastes 3:1" },
  { kind: "versiculo", text: "Confia no Senhor de todo o teu coracao e nao te estribes no teu proprio entendimento.", source: "Proverbios 3:5" },
  { kind: "versiculo", text: "O Senhor e o meu pastor; nada me faltara.", source: "Salmos 23:1" },
  { kind: "versiculo", text: "Tudo posso naquele que me fortalece.", source: "Filipenses 4:13" },
  { kind: "versiculo", text: "Nao andeis ansiosos de coisa alguma; em tudo, porem, sejam conhecidas, diante de Deus, as vossas peticoes.", source: "Filipenses 4:6" },
  { kind: "versiculo", text: "Entrega o teu caminho ao Senhor; confia nele, e ele tudo fara.", source: "Salmos 37:5" },
  { kind: "versiculo", text: "Porque eu bem sei os pensamentos que penso a vosso respeito, diz o Senhor; pensamentos de paz, e nao de mal, para vos dar o fim que esperais.", source: "Jeremias 29:11" },
  { kind: "versiculo", text: "As misericordias do Senhor se renovam a cada manha; grande e a tua fidelidade.", source: "Lamentacoes 3:22-23" },
  { kind: "versiculo", text: "Nao te mandei eu? Se forte e corajoso; nao temas, nem te espantes, porque o Senhor, teu Deus, e contigo.", source: "Josue 1:9" },
  { kind: "versiculo", text: "Bem-aventurado o homem que confia no Senhor e cuja esperanca e o Senhor.", source: "Jeremias 17:7" },
  { kind: "versiculo", text: "Vinde a mim, todos os que estais cansados e sobrecarregados, e eu vos aliviarei.", source: "Mateus 11:28" },
  { kind: "versiculo", text: "Alegrai-vos sempre. Orai sem cessar. Em tudo dai gracas.", source: "1 Tessalonicenses 5:16-18" },
  { kind: "versiculo", text: "O amor e paciente, e bondoso; nao arde em ciumes, nao se vangloria, nao se ensoberbece.", source: "1 Corintios 13:4" },
  { kind: "versiculo", text: "Fortalece-te e revista-te de coragem.", source: "1 Cronicas 28:20" },
  { kind: "versiculo", text: "Buscai primeiro o reino de Deus e a sua justica, e todas essas coisas vos serao acrescentadas.", source: "Mateus 6:33" },
  { kind: "versiculo", text: "Ainda que eu ande pelo vale da sombra da morte, nao temerei mal algum, porque tu estas comigo.", source: "Salmos 23:4" },
  { kind: "versiculo", text: "O Senhor e a minha luz e a minha salvacao; a quem temerei?", source: "Salmos 27:1" },
  { kind: "versiculo", text: "Tudo o que fizerdes, fazei-o de todo o coracao, como para o Senhor.", source: "Colossenses 3:23" },
  { kind: "versiculo", text: "Regozijai-vos na esperanca, sede pacientes na tribulacao, perseverai na oracao.", source: "Romanos 12:12" },
  { kind: "versiculo", text: "Deleita-te tambem no Senhor, e ele te concedera os desejos do teu coracao.", source: "Salmos 37:4" },
  { kind: "proverbio", text: "Antes de tudo, coloca ordem em ti mesmo; so entao ensina aos outros.", source: "Proverbio chines" },
  { kind: "proverbio", text: "Devagar se vai ao longe.", source: "Ditado popular" },
  { kind: "proverbio", text: "Agua mole em pedra dura tanto bate ate que fura.", source: "Ditado popular" },
  { kind: "proverbio", text: "Nao deixes para amanha o que podes fazer hoje.", source: "Ditado popular" },
  { kind: "proverbio", text: "Quem planta vento, colhe tempestade.", source: "Proverbios 22:8" },
  { kind: "proverbio", text: "Uma jornada de mil quilometros comeca com um unico passo.", source: "Lao Tse" },
  { kind: "proverbio", text: "O rio corta a pedra nao pela forca, mas pela persistencia.", source: "Proverbio popular" },
  { kind: "proverbio", text: "Cada dia tem o seu afa.", source: "Mateus 6:34" },
  { kind: "proverbio", text: "A pressa e inimiga da perfeicao.", source: "Ditado popular" },
  { kind: "proverbio", text: "Colhe-se o que se planta.", source: "Galatas 6:7" },
  { kind: "proverbio", text: "Melhor e o pouco com justica do que a abundancia de rendas sem ela.", source: "Proverbios 16:8" },
  { kind: "proverbio", text: "Quem tudo quer, tudo perde.", source: "Ditado popular" },
  { kind: "proverbio", text: "O ferro afia o ferro; assim se afia um homem no rosto do seu amigo.", source: "Proverbios 27:17" },
  { kind: "proverbio", text: "Nao ha atalho para lugar algum que valha a pena chegar.", source: "Beverly Sills" },
  { kind: "proverbio", text: "Constancia e o que transforma a intencao em resultado.", source: "Proverbio popular" },
  { kind: "proverbio", text: "O prudente ve o mal e esconde-se; mas os simples passam e sofrem a pena.", source: "Proverbios 22:3" },
  { kind: "proverbio", text: "Aquele que anda com sabios sera sabio.", source: "Proverbios 13:20" },
  { kind: "proverbio", text: "Um pouco de descanso, com as maos cruzadas, e melhor do que labutar sem parar.", source: "Eclesiastes 4:6 (parafraseado)" },
  { kind: "proverbio", text: "Nao e o quanto fazemos, mas quanto amor colocamos no que fazemos.", source: "Madre Teresa de Calcuta" },
  { kind: "proverbio", text: "O habito e a corda mais forte: fiamos um fio por dia, ate que nao a podemos romper.", source: "Proverbio popular" },
];

/**
 * Seleciona a frase do dia de forma deterministica a partir de "YYYY-MM-DD" --
 * mesmo calculo simples usado em qualquer "hash de string", sem depender de
 * banco nem de estado: o mesmo dia sempre devolve a mesma frase.
 */
export function pickDailyWisdom(dateKey: string): DailyWisdom {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return DAILY_WISDOM[hash % DAILY_WISDOM.length];
}
