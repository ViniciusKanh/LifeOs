/**
 * Termo de Uso e Política de Privacidade do LifeOS — fonte única do texto
 * exibido em /termos e /privacidade, no aceite do cadastro e no aviso de
 * nova versão. A versão precisa ser IGUAL a CURRENT_TERMS_VERSION em
 * apps/api/src/config/legal.ts; ao mudar o conteúdo de forma relevante,
 * atualize as duas (os usuários serão convidados a aceitar de novo).
 *
 * O mesmo texto está em docs/PRIVACY.md e docs/TERMS.md para o GitHub e
 * para a página de privacidade exigida pela Microsoft Store.
 */

export const LEGAL_VERSION = "2026-09-30";
export const LEGAL_UPDATED_LABEL = "30 de setembro de 2026";

export const CONTROLLER = {
  product: "LifeOS",
  name: "Vinicius Santos",
  role: "desenvolvedor e responsável pelo LifeOS (controlador dos dados)",
  email: "viniciussouza742@gmail.com",
  country: "Brasil",
  site: "https://lifeos-sigma-five.vercel.app",
};

export interface LegalSection {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: { head: string[]; rows: string[][] };
}

export interface LegalDoc {
  title: string;
  summary: string;
  sections: LegalSection[];
}

export const PRIVACY_POLICY: LegalDoc = {
  title: "Política de Privacidade",
  summary:
    "Esta Política explica, em linguagem direta, quais dados o LifeOS coleta, por que coleta, com quem compartilha, por quanto tempo guarda e como você exerce os seus direitos previstos na Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).",
  sections: [
    {
      id: "quem-somos",
      title: "1. Quem é o responsável pelos seus dados",
      paragraphs: [
        `O ${CONTROLLER.product} é um aplicativo pessoal de produtividade, organização, saúde, estudos e acompanhamento de rotina. O controlador dos dados pessoais tratados no app é ${CONTROLLER.name}, ${CONTROLLER.role}, com sede no ${CONTROLLER.country}.`,
        `Para qualquer assunto de privacidade — inclusive como Encarregado pelo Tratamento de Dados (art. 41 da LGPD) — o contato é ${CONTROLLER.email}.`,
      ],
    },
    {
      id: "principios",
      title: "2. Nossos compromissos",
      bullets: [
        "Coletamos apenas o necessário para as funções que você usa (princípio da necessidade).",
        "Seus dados não são vendidos, alugados nem usados para publicidade.",
        "Cada conta é isolada: nenhum usuário vê os dados de outro.",
        "As métricas do app (Life Score, Analytics, Signals) são calculadas somente a partir do que você registra — nada é inventado.",
        "Você pode exportar e excluir seus dados a qualquer momento, pelo próprio app.",
      ],
    },
    {
      id: "dados-coletados",
      title: "3. Quais dados coletamos",
      paragraphs: ["Os dados abaixo só existem se você usar o recurso correspondente. Nenhum módulo é obrigatório além do cadastro."],
      table: {
        head: ["Categoria", "Exemplos", "De onde vem"],
        rows: [
          ["Cadastro e conta", "Nome, e-mail, senha (guardada apenas como hash bcrypt), foto de perfil, idioma, fuso horário, tema", "Informado por você"],
          ["Login com Google (opcional)", "Identificador da conta Google, nome, e-mail, foto", "Google, com a sua autorização"],
          ["Segurança", "Status da verificação em duas etapas, segredo do app autenticador (criptografado), códigos de recuperação (apenas hash), data do último acesso, registros de auditoria de ações administrativas", "Gerado pelo app"],
          ["Produtividade", "Tarefas, projetos (incluindo objetivo, escopo, cliente, orçamento, links), anexos de tarefas (imagens e PDFs), Kanban, Gantt, agenda, inbox, anotações profissionais", "Informado por você"],
          ["Diário (Journal)", "Textos, reflexões, gratidão, fotos, vídeos, PDFs, notas de voz, histórias das mídias, etiquetas, localização do dia (se você informar), vínculos com projetos e metas", "Informado por você"],
          ["Saúde e bem-estar (dado pessoal sensível)", "Água, sono, exercícios, humor, energia, estresse", "Informado por você"],
          ["Estudos e leitura", "Formações, disciplinas, prazos, TCC/dissertação, livros, páginas lidas, notas de leitura", "Informado por você; dados públicos de livros via Google Books/Open Library"],
          ["Hábitos, metas e experimentos", "Hábitos e check-ins, metas e progresso, experimentos pessoais e observações", "Informado por você"],
          ["Contexto do dia", "Cidade/coordenadas que você escolher e dados de clima correspondentes", "Informado por você; clima via Open-Meteo"],
          ["Notificações", "Inscrição de push do navegador, preferências de lembretes e de e-mail semanal", "Gerado pelo seu navegador/app"],
          ["Dados técnicos", "Endereço IP (em registros de segurança e limite de tentativas), tipo de navegador, cookies de sessão", "Coletado automaticamente"],
        ],
      },
    },
    {
      id: "finalidades",
      title: "4. Para que usamos e com qual base legal",
      table: {
        head: ["Finalidade", "Base legal (LGPD)"],
        rows: [
          ["Criar e manter sua conta, autenticar o acesso e proteger a conta (senha, MFA, sessões)", "Execução de contrato (art. 7º, V) e legítimo interesse em segurança (art. 7º, IX)"],
          ["Oferecer os módulos do app (tarefas, projetos, diário, estudos, leitura, hábitos, metas)", "Execução de contrato (art. 7º, V)"],
          ["Tratar dados de saúde e conteúdos íntimos do Diário para exibir seus registros, métricas e o Life Score", "Consentimento específico e destacado (art. 11, I), dado no aceite deste documento"],
          ["Gerar insights e organizar textos com IA (Gemini), quando você usa esses recursos", "Consentimento (art. 7º, I e art. 11, I)"],
          ["Enviar e-mails de confirmação, recuperação de senha, avisos de segurança e o resumo semanal (este último pode ser desligado)", "Execução de contrato e legítimo interesse (art. 7º, V e IX)"],
          ["Enviar notificações push e lembretes que você ativou", "Consentimento (art. 7º, I)"],
          ["Prevenir fraude e abuso (limite de tentativas, auditoria de ações administrativas)", "Legítimo interesse (art. 7º, IX)"],
          ["Cumprir obrigações legais e atender autoridades", "Obrigação legal (art. 7º, II)"],
        ],
      },
    },
    {
      id: "ia",
      title: "5. Inteligência artificial (LifeOS Copilot e Gemini)",
      paragraphs: [
        "Alguns recursos usam a API Gemini, do Google, para gerar insights do dia, sugestões, análise de experimentos e a organização por temas do Diário.",
        "Enviamos ao modelo apenas o necessário para aquela resposta — por exemplo, resumos numéricos da sua rotina ou os textos do dia que você pediu para organizar. Arquivos (fotos, vídeos, PDFs, áudios) nunca são enviados à IA; apenas o texto que você escreveu sobre eles.",
        "A IA não altera, cria nem exclui dados sem a sua confirmação. Sugestões são sempre identificadas como sugestão e não como fato. As chaves de acesso à IA ficam somente no servidor.",
        "O processamento pelo Google segue os termos da Google para a API Gemini. Se não quiser que nenhum dado passe pela IA, basta não usar os botões de IA — o restante do app funciona normalmente.",
      ],
    },
    {
      id: "compartilhamento",
      title: "6. Com quem compartilhamos (operadores)",
      paragraphs: ["Não vendemos dados. Compartilhamos apenas com prestadores necessários para o app funcionar, que tratam os dados em nosso nome:"],
      table: {
        head: ["Serviço", "Para quê", "Dados envolvidos"],
        rows: [
          ["Vercel Inc. (EUA)", "Hospedagem do site e da API", "Todo o tráfego do app, em trânsito com HTTPS"],
          ["Turso / ChiselStrike (libSQL)", "Banco de dados", "Todos os dados da conta"],
          ["Google LLC", "Login com Google (opcional) e API Gemini (quando usada)", "Dados do perfil Google; textos/resumos enviados à IA"],
          ["Provedor de e-mail (SMTP) configurado pelo administrador", "E-mails transacionais e resumo semanal", "Nome, e-mail e conteúdo da mensagem"],
          ["Open-Meteo", "Previsão do tempo e busca de cidades", "Coordenadas/cidade escolhidas (sem nome ou e-mail)"],
          ["Google Books e Open Library", "Buscar livros por ISBN", "Apenas o ISBN/termo pesquisado"],
          ["OpenStreetMap", "Mapa da aba Lugares do Diário", "Seu IP e a região do mapa visualizada (carregamento dos mapas)"],
          ["Serviços de push do navegador (Google, Microsoft, Mozilla, Apple)", "Entregar notificações", "Endpoint de push do dispositivo"],
        ],
      },
    },
    {
      id: "transferencia",
      title: "7. Transferência internacional",
      paragraphs: [
        "Alguns operadores (como Vercel e Google) armazenam ou processam dados fora do Brasil, principalmente nos Estados Unidos. Essas transferências ocorrem para executar o serviço que você contratou e com base nas garantias contratuais e de segurança oferecidas por esses provedores (art. 33 da LGPD).",
      ],
    },
    {
      id: "admin",
      title: "8. O que o administrador do app consegue ver",
      bullets: [
        "Dados da conta: nome, e-mail, papel, data de criação, último acesso, se o e-mail foi confirmado, se há login com Google e se a verificação em duas etapas está ativa.",
        "Métricas agregadas de uso: apenas CONTAGENS por módulo (por exemplo, \"12 tarefas\", \"30 entradas no Diário\") e o espaço ocupado por mídias.",
        "O administrador NÃO vê o conteúdo das suas tarefas, do Diário, das mídias, dos registros de saúde nem das suas senhas ou segredos do app autenticador.",
        "Ações de suporte (remover o MFA quando você perde o celular, enviar link de nova senha, gerar senha temporária, encerrar sessões, excluir a conta) ficam registradas em log de auditoria.",
      ],
    },
    {
      id: "cookies",
      title: "9. Cookies e armazenamento local",
      bullets: [
        "Cookie de sessão (lifeos_session): httpOnly e seguro, necessário para manter você conectado. Com \"Permanecer conectado\" ele dura até 30 dias e é renovado enquanto você usa o app; sem essa opção, cerca de 12 horas.",
        "Cookie temporário do login com Google: usado apenas durante o redirecionamento, por até 10 minutos.",
        "Armazenamento local do navegador: apenas preferências de interface (tema, menu lateral recolhido, grupos abertos). Nenhuma senha, token ou chave fica no armazenamento local.",
        "Não usamos cookies de publicidade nem de rastreamento de terceiros.",
      ],
    },
    {
      id: "retencao",
      title: "10. Por quanto tempo guardamos",
      bullets: [
        "Enquanto a sua conta existir. Ao excluir a conta, todos os dados vinculados a ela são apagados do banco de dados principal imediatamente (exclusão em cascata).",
        "Cópias de segurança mantidas pelos provedores de infraestrutura podem levar até 30 dias para serem sobrescritas.",
        "Links de confirmação e de redefinição de senha expiram em 24 horas e 1 hora, respectivamente.",
        "Registros de auditoria e de segurança podem ser mantidos pelo prazo necessário para proteger o serviço e cumprir obrigações legais (por exemplo, o Marco Civil da Internet, art. 15, quando aplicável).",
      ],
    },
    {
      id: "seguranca",
      title: "11. Como protegemos seus dados",
      bullets: [
        "Tráfego sempre criptografado com HTTPS/TLS.",
        "Senhas armazenadas somente como hash bcrypt; nunca em texto puro.",
        "Verificação em duas etapas (MFA) por aplicativo autenticador, com códigos de recuperação de uso único.",
        "Segredos e credenciais criptografados com AES-256-GCM no servidor; nunca enviados ao navegador.",
        "Isolamento por usuário em todas as consultas ao banco, controle de acesso por papel (usuário/administrador) validado no servidor, limite de tentativas de login e registro de auditoria.",
        "Sessões encerradas automaticamente em todos os dispositivos quando a senha é trocada ou redefinida.",
      ],
      paragraphs: ["Nenhum sistema é 100% invulnerável. Se ocorrer um incidente de segurança que possa gerar risco relevante, avisaremos você e a Autoridade Nacional de Proteção de Dados (ANPD), nos termos do art. 48 da LGPD."],
    },
    {
      id: "direitos",
      title: "12. Seus direitos (art. 18 da LGPD)",
      bullets: [
        "Confirmar se tratamos seus dados e acessá-los — em Perfil › Exportar meus dados você baixa tudo em JSON.",
        "Corrigir dados incompletos, inexatos ou desatualizados — direto nas telas do app.",
        "Solicitar anonimização, bloqueio ou eliminação de dados desnecessários.",
        "Portabilidade — o arquivo exportado é legível por máquina (JSON).",
        "Eliminar os dados tratados com consentimento e excluir a conta — em Perfil › Excluir minha conta.",
        "Saber com quem compartilhamos seus dados (seção 6).",
        "Revogar o consentimento a qualquer momento (por exemplo, deixando de usar a IA, desligando notificações ou excluindo a conta), sem afetar o que foi feito antes.",
        `Peticionar à ANPD. Antes, se quiser, fale com a gente em ${CONTROLLER.email} — respondemos em até 15 dias.`,
      ],
    },
    {
      id: "criancas",
      title: "13. Crianças e adolescentes",
      paragraphs: [
        "O LifeOS não é direcionado a menores de 13 anos. Adolescentes entre 13 e 18 anos só devem usar o app com a autorização e o acompanhamento dos pais ou responsáveis. Se identificarmos uma conta de criança sem esse consentimento, ela será excluída.",
      ],
    },
    {
      id: "alteracoes",
      title: "14. Mudanças nesta Política",
      paragraphs: [
        "Podemos atualizar esta Política para refletir novos recursos ou exigências legais. Quando a mudança for relevante, você verá o novo texto ao entrar no app e precisará aceitá-lo para continuar; a data e a versão que você aceitou ficam registradas na sua conta.",
      ],
    },
    {
      id: "contato",
      title: "15. Contato",
      paragraphs: [`Dúvidas, pedidos ou reclamações sobre privacidade: ${CONTROLLER.email}.`],
    },
  ],
};

export const TERMS_OF_USE: LegalDoc = {
  title: "Termo de Uso",
  summary: `Ao criar uma conta ou usar o ${CONTROLLER.product}, você concorda com estas regras. Leia com atenção — elas explicam o que o app oferece, o que esperamos de você e os limites da nossa responsabilidade.`,
  sections: [
    {
      id: "servico",
      title: "1. O serviço",
      paragraphs: [
        `O ${CONTROLLER.product} é um "sistema operacional pessoal": reúne tarefas, projetos, agenda, diário, estudos, leitura, hábitos, saúde, metas, métricas e um assistente com IA, seguindo o ciclo Planejar → Executar → Registrar → Medir → Melhorar.`,
        "O app é oferecido na web (PWA) e poderá ser distribuído em lojas como a Microsoft Store. Recursos podem ser adicionados, alterados ou removidos com o tempo.",
      ],
    },
    {
      id: "conta",
      title: "2. Sua conta",
      bullets: [
        "Você deve informar dados verdadeiros e manter seu e-mail atualizado.",
        "A senha é pessoal e intransferível. Recomendamos ativar a verificação em duas etapas (Perfil › Segurança).",
        "Guarde seus códigos de recuperação em local seguro: sem eles e sem o celular, a recuperação do MFA depende do suporte.",
        "Avise-nos imediatamente em caso de suspeita de acesso indevido.",
        "Idade mínima: 13 anos; entre 13 e 18 anos, com autorização dos responsáveis.",
      ],
    },
    {
      id: "uso",
      title: "3. Uso permitido",
      paragraphs: ["Você se compromete a não:"],
      bullets: [
        "usar o app para atividades ilegais ou para armazenar conteúdo ilícito, que viole direitos de terceiros ou que exponha outras pessoas sem autorização;",
        "tentar acessar dados de outros usuários, burlar autenticação, limites de uso ou medidas de segurança;",
        "fazer engenharia reversa, sobrecarregar a infraestrutura ou automatizar acessos abusivos;",
        "enviar arquivos com vírus ou código malicioso.",
      ],
    },
    {
      id: "conteudo",
      title: "4. Seu conteúdo",
      paragraphs: [
        "Tudo o que você registra (textos, mídias, dados de saúde, tarefas etc.) continua sendo seu. Você nos concede apenas a permissão necessária para armazenar, processar e exibir esse conteúdo para você, dentro das funções do app e conforme a Política de Privacidade.",
        "Você é responsável pelo conteúdo que envia, inclusive fotos e vídeos de outras pessoas.",
      ],
    },
    {
      id: "saude-ia",
      title: "5. Saúde, métricas e IA não substituem profissionais",
      bullets: [
        "Os registros de saúde, o Life Score, as correlações e os insights são ferramentas de autoconhecimento. Não são diagnóstico, tratamento nem aconselhamento médico, psicológico, jurídico ou financeiro.",
        "Correlações mostram associação entre registros, não causa.",
        "Respostas de IA podem conter erros. Confira antes de tomar decisões importantes. Ações sugeridas pela IA só são executadas com a sua confirmação.",
        "Em caso de emergência, procure atendimento profissional.",
      ],
    },
    {
      id: "disponibilidade",
      title: "6. Disponibilidade e limites",
      bullets: [
        "Buscamos manter o app estável e seguro, mas ele é oferecido \"no estado em que se encontra\", podendo ter interrupções para manutenção ou por falhas de provedores.",
        "Há limites técnicos de uso (por exemplo, arquivos de até cerca de 3 MB e número de mídias por dia).",
        "Recomendamos exportar seus dados periodicamente (Perfil › Exportar meus dados).",
      ],
    },
    {
      id: "responsabilidade",
      title: "7. Responsabilidade",
      paragraphs: [
        "Na extensão permitida pela lei, não nos responsabilizamos por decisões tomadas com base nas métricas ou sugestões do app, nem por perdas decorrentes de uso indevido da sua conta por falta de cuidado com a senha. Nada neste Termo afasta direitos garantidos pelo Código de Defesa do Consumidor quando aplicável.",
      ],
    },
    {
      id: "encerramento",
      title: "8. Encerramento da conta",
      bullets: [
        "Você pode excluir sua conta a qualquer momento em Perfil › Excluir minha conta; os dados são apagados conforme a Política de Privacidade.",
        "Podemos suspender ou encerrar contas que violem este Termo, com aviso quando possível.",
      ],
    },
    {
      id: "gerais",
      title: "9. Disposições gerais",
      bullets: [
        "Este Termo pode ser atualizado; mudanças relevantes serão apresentadas no app para novo aceite.",
        "Vale a legislação brasileira. Fica eleito o foro do domicílio do usuário, conforme o Código de Defesa do Consumidor.",
        `Contato: ${CONTROLLER.email}.`,
      ],
    },
  ],
};
