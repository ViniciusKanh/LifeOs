# Política de Privacidade — LifeOS

> Versão **2026-09-30** · Última atualização: 30 de setembro de 2026  
> Versão oficial exibida no app: https://lifeos-sigma-five.vercel.app/privacidade

Esta Política explica, em linguagem direta, quais dados o LifeOS coleta, por que coleta, com quem compartilha, por quanto tempo guarda e como você exerce os seus direitos previstos na Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).

## Sumário

- [1. Quem é o responsável pelos seus dados](#quem-somos)
- [2. Nossos compromissos](#principios)
- [3. Quais dados coletamos](#dados-coletados)
- [4. Para que usamos e com qual base legal](#finalidades)
- [5. Inteligência artificial (LifeOS Copilot e Gemini)](#ia)
- [6. Com quem compartilhamos (operadores)](#compartilhamento)
- [7. Transferência internacional](#transferencia)
- [8. O que o administrador do app consegue ver](#admin)
- [9. Cookies e armazenamento local](#cookies)
- [10. Por quanto tempo guardamos](#retencao)
- [11. Como protegemos seus dados](#seguranca)
- [12. Seus direitos (art. 18 da LGPD)](#direitos)
- [13. Crianças e adolescentes](#criancas)
- [14. Mudanças nesta Política](#alteracoes)
- [15. Contato](#contato)

<a id="quem-somos"></a>

## 1. Quem é o responsável pelos seus dados

O LifeOS é um aplicativo pessoal de produtividade, organização, saúde, estudos e acompanhamento de rotina. O controlador dos dados pessoais tratados no app é Vinicius Santos, desenvolvedor e responsável pelo LifeOS (controlador dos dados), com sede no Brasil.

Para qualquer assunto de privacidade — inclusive como Encarregado pelo Tratamento de Dados (art. 41 da LGPD) — o contato é viniciussouza742@gmail.com.

<a id="principios"></a>

## 2. Nossos compromissos

- Coletamos apenas o necessário para as funções que você usa (princípio da necessidade).
- Seus dados não são vendidos, alugados nem usados para publicidade.
- Cada conta é isolada: nenhum usuário vê os dados de outro.
- As métricas do app (Life Score, Analytics, Signals) são calculadas somente a partir do que você registra — nada é inventado.
- Você pode exportar e excluir seus dados a qualquer momento, pelo próprio app.

<a id="dados-coletados"></a>

## 3. Quais dados coletamos

Os dados abaixo só existem se você usar o recurso correspondente. Nenhum módulo é obrigatório além do cadastro.

| Categoria | Exemplos | De onde vem |
| --- | --- | --- |
| Cadastro e conta | Nome, e-mail, senha (guardada apenas como hash bcrypt), foto de perfil, idioma, fuso horário, tema | Informado por você |
| Login com Google (opcional) | Identificador da conta Google, nome, e-mail, foto | Google, com a sua autorização |
| Segurança | Status da verificação em duas etapas, segredo do app autenticador (criptografado), códigos de recuperação (apenas hash), data do último acesso, registros de auditoria de ações administrativas | Gerado pelo app |
| Produtividade | Tarefas, projetos (incluindo objetivo, escopo, cliente, orçamento, links), anexos de tarefas (imagens e PDFs), Kanban, Gantt, agenda, inbox, anotações profissionais | Informado por você |
| Diário (Journal) | Textos, reflexões, gratidão, fotos, vídeos, PDFs, notas de voz, histórias das mídias, etiquetas, localização do dia (se você informar), vínculos com projetos e metas | Informado por você |
| Saúde e bem-estar (dado pessoal sensível) | Água, sono, exercícios, humor, energia, estresse | Informado por você |
| Estudos e leitura | Formações, disciplinas, prazos, TCC/dissertação, livros, páginas lidas, notas de leitura | Informado por você; dados públicos de livros via Google Books/Open Library |
| Hábitos, metas e experimentos | Hábitos e check-ins, metas e progresso, experimentos pessoais e observações | Informado por você |
| Contexto do dia | Cidade/coordenadas que você escolher e dados de clima correspondentes | Informado por você; clima via Open-Meteo |
| Notificações | Inscrição de push do navegador, preferências de lembretes e de e-mail semanal | Gerado pelo seu navegador/app |
| Dados técnicos | Endereço IP (em registros de segurança e limite de tentativas), tipo de navegador, cookies de sessão | Coletado automaticamente |

<a id="finalidades"></a>

## 4. Para que usamos e com qual base legal

| Finalidade | Base legal (LGPD) |
| --- | --- |
| Criar e manter sua conta, autenticar o acesso e proteger a conta (senha, MFA, sessões) | Execução de contrato (art. 7º, V) e legítimo interesse em segurança (art. 7º, IX) |
| Oferecer os módulos do app (tarefas, projetos, diário, estudos, leitura, hábitos, metas) | Execução de contrato (art. 7º, V) |
| Tratar dados de saúde e conteúdos íntimos do Diário para exibir seus registros, métricas e o Life Score | Consentimento específico e destacado (art. 11, I), dado no aceite deste documento |
| Gerar insights e organizar textos com IA (Gemini), quando você usa esses recursos | Consentimento (art. 7º, I e art. 11, I) |
| Enviar e-mails de confirmação, recuperação de senha, avisos de segurança e o resumo semanal (este último pode ser desligado) | Execução de contrato e legítimo interesse (art. 7º, V e IX) |
| Enviar notificações push e lembretes que você ativou | Consentimento (art. 7º, I) |
| Prevenir fraude e abuso (limite de tentativas, auditoria de ações administrativas) | Legítimo interesse (art. 7º, IX) |
| Cumprir obrigações legais e atender autoridades | Obrigação legal (art. 7º, II) |

<a id="ia"></a>

## 5. Inteligência artificial (LifeOS Copilot e Gemini)

Alguns recursos usam a API Gemini, do Google, para gerar insights do dia, sugestões, análise de experimentos e a organização por temas do Diário.

Enviamos ao modelo apenas o necessário para aquela resposta — por exemplo, resumos numéricos da sua rotina ou os textos do dia que você pediu para organizar. Arquivos (fotos, vídeos, PDFs, áudios) nunca são enviados à IA; apenas o texto que você escreveu sobre eles.

A IA não altera, cria nem exclui dados sem a sua confirmação. Sugestões são sempre identificadas como sugestão e não como fato. As chaves de acesso à IA ficam somente no servidor.

O processamento pelo Google segue os termos da Google para a API Gemini. Se não quiser que nenhum dado passe pela IA, basta não usar os botões de IA — o restante do app funciona normalmente.

<a id="compartilhamento"></a>

## 6. Com quem compartilhamos (operadores)

Não vendemos dados. Compartilhamos apenas com prestadores necessários para o app funcionar, que tratam os dados em nosso nome:

| Serviço | Para quê | Dados envolvidos |
| --- | --- | --- |
| Vercel Inc. (EUA) | Hospedagem do site e da API | Todo o tráfego do app, em trânsito com HTTPS |
| Turso / ChiselStrike (libSQL) | Banco de dados | Todos os dados da conta |
| Google LLC | Login com Google (opcional) e API Gemini (quando usada) | Dados do perfil Google; textos/resumos enviados à IA |
| Provedor de e-mail (SMTP) configurado pelo administrador | E-mails transacionais e resumo semanal | Nome, e-mail e conteúdo da mensagem |
| Open-Meteo | Previsão do tempo e busca de cidades | Coordenadas/cidade escolhidas (sem nome ou e-mail) |
| Google Books e Open Library | Buscar livros por ISBN | Apenas o ISBN/termo pesquisado |
| OpenStreetMap | Mapa da aba Lugares do Diário | Seu IP e a região do mapa visualizada (carregamento dos mapas) |
| Serviços de push do navegador (Google, Microsoft, Mozilla, Apple) | Entregar notificações | Endpoint de push do dispositivo |

<a id="transferencia"></a>

## 7. Transferência internacional

Alguns operadores (como Vercel e Google) armazenam ou processam dados fora do Brasil, principalmente nos Estados Unidos. Essas transferências ocorrem para executar o serviço que você contratou e com base nas garantias contratuais e de segurança oferecidas por esses provedores (art. 33 da LGPD).

<a id="admin"></a>

## 8. O que o administrador do app consegue ver

- Dados da conta: nome, e-mail, papel, data de criação, último acesso, se o e-mail foi confirmado, se há login com Google e se a verificação em duas etapas está ativa.
- Métricas agregadas de uso: apenas CONTAGENS por módulo (por exemplo, "12 tarefas", "30 entradas no Diário") e o espaço ocupado por mídias.
- O administrador NÃO vê o conteúdo das suas tarefas, do Diário, das mídias, dos registros de saúde nem das suas senhas ou segredos do app autenticador.
- Ações de suporte (remover o MFA quando você perde o celular, enviar link de nova senha, gerar senha temporária, encerrar sessões, excluir a conta) ficam registradas em log de auditoria.

<a id="cookies"></a>

## 9. Cookies e armazenamento local

- Cookie de sessão (lifeos_session): httpOnly e seguro, necessário para manter você conectado. Com "Permanecer conectado" ele dura até 30 dias e é renovado enquanto você usa o app; sem essa opção, cerca de 12 horas.
- Cookie temporário do login com Google: usado apenas durante o redirecionamento, por até 10 minutos.
- Armazenamento local do navegador: apenas preferências de interface (tema, menu lateral recolhido, grupos abertos). Nenhuma senha, token ou chave fica no armazenamento local.
- Não usamos cookies de publicidade nem de rastreamento de terceiros.

<a id="retencao"></a>

## 10. Por quanto tempo guardamos

- Enquanto a sua conta existir. Ao excluir a conta, todos os dados vinculados a ela são apagados do banco de dados principal imediatamente (exclusão em cascata).
- Cópias de segurança mantidas pelos provedores de infraestrutura podem levar até 30 dias para serem sobrescritas.
- Links de confirmação e de redefinição de senha expiram em 24 horas e 1 hora, respectivamente.
- Registros de auditoria e de segurança podem ser mantidos pelo prazo necessário para proteger o serviço e cumprir obrigações legais (por exemplo, o Marco Civil da Internet, art. 15, quando aplicável).

<a id="seguranca"></a>

## 11. Como protegemos seus dados

Nenhum sistema é 100% invulnerável. Se ocorrer um incidente de segurança que possa gerar risco relevante, avisaremos você e a Autoridade Nacional de Proteção de Dados (ANPD), nos termos do art. 48 da LGPD.

- Tráfego sempre criptografado com HTTPS/TLS.
- Senhas armazenadas somente como hash bcrypt; nunca em texto puro.
- Verificação em duas etapas (MFA) por aplicativo autenticador, com códigos de recuperação de uso único.
- Segredos e credenciais criptografados com AES-256-GCM no servidor; nunca enviados ao navegador.
- Isolamento por usuário em todas as consultas ao banco, controle de acesso por papel (usuário/administrador) validado no servidor, limite de tentativas de login e registro de auditoria.
- Sessões encerradas automaticamente em todos os dispositivos quando a senha é trocada ou redefinida.

<a id="direitos"></a>

## 12. Seus direitos (art. 18 da LGPD)

- Confirmar se tratamos seus dados e acessá-los — em Perfil › Exportar meus dados você baixa tudo em JSON.
- Corrigir dados incompletos, inexatos ou desatualizados — direto nas telas do app.
- Solicitar anonimização, bloqueio ou eliminação de dados desnecessários.
- Portabilidade — o arquivo exportado é legível por máquina (JSON).
- Eliminar os dados tratados com consentimento e excluir a conta — em Perfil › Excluir minha conta.
- Saber com quem compartilhamos seus dados (seção 6).
- Revogar o consentimento a qualquer momento (por exemplo, deixando de usar a IA, desligando notificações ou excluindo a conta), sem afetar o que foi feito antes.
- Peticionar à ANPD. Antes, se quiser, fale com a gente em viniciussouza742@gmail.com — respondemos em até 15 dias.

<a id="criancas"></a>

## 13. Crianças e adolescentes

O LifeOS não é direcionado a menores de 13 anos. Adolescentes entre 13 e 18 anos só devem usar o app com a autorização e o acompanhamento dos pais ou responsáveis. Se identificarmos uma conta de criança sem esse consentimento, ela será excluída.

<a id="alteracoes"></a>

## 14. Mudanças nesta Política

Podemos atualizar esta Política para refletir novos recursos ou exigências legais. Quando a mudança for relevante, você verá o novo texto ao entrar no app e precisará aceitá-lo para continuar; a data e a versão que você aceitou ficam registradas na sua conta.

<a id="contato"></a>

## 15. Contato

Dúvidas, pedidos ou reclamações sobre privacidade: viniciussouza742@gmail.com.

---

_Arquivo gerado automaticamente a partir de `apps/web/src/content/legal.ts`. Não edite à mão._
