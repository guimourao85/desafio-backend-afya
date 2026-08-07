# DEBITOS-TECNICOS.md — ProntoMed

> Sumário:
> - §convencao — como registrar, numerar e fechar um débito
> - §visao-geral — contagem por severidade e por área
> - §abertos — débitos vivos, com razão e gatilho de reabertura
> - §resolvidos — o que já foi fechado, e por qual mudança
>
> Débito declarado vale mais que completude fingida. Quem lê a API precisa saber
> onde ela para — e que a parada foi escolha, não descuido.

---

<!-- §convencao -->
## Convenção

- **ID:** `DEBT-NN`, sequencial, **nunca reaproveitado** — um débito fechado mantém o número em §resolvidos.
- **Registro obrigatório** quando: uma decisão adia rigor; uma alternativa melhor é rejeitada por custo; um limite conhecido fica no produto.
- **Campos:** severidade · área · o que é · por que fica assim · **gatilho de reabertura** (o evento que torna o débito inaceitável).
- **Severidade:** `ALTO` (compromete requisito ou segurança em uso real) · `MÉDIO` (limita evolução) · `BAIXO` (conforto).
- Nenhum débito nasce sem gatilho de reabertura. Débito sem gatilho é desculpa.
<!-- /§convencao -->

---

<!-- §visao-geral -->
## Visão geral

| | ALTO | MÉDIO | BAIXO | Total |
| --- | --- | --- | --- | --- |
| **Abertos** | 2 | 7 | 3 | **12** |
| **Resolvidos** | 0 | 0 | 0 | **0** |

Por área: privacidade 1 · domínio 3 · segurança 4 · arquitetura 3 · performance 1.
<!-- /§visao-geral -->

---

<!-- §abertos -->
## Abertos

### DEBT-01 · ALTO · privacidade
**Apagar o paciente não apaga o que o médico escreveu sobre ele.**
`AnonymizePatient` apaga os campos estruturados do paciente (nome, telefone,
email, nascimento), mas o conteúdo de `consultation_notes` é texto livre e pode
conter identificação digitada pelo médico.
**Por que fica assim:** achar nome de pessoa em texto corrido exige NLP ou curadoria humana — fora do escopo de uma POC, e um "regex de nome" daria falsa sensação de conformidade.
**Gatilho de reabertura:** qualquer uso com dado real de paciente.

### DEBT-02 · MÉDIO · domínio
**O sistema barra duas consultas no mesmo horário, mas não duas que se atropelam.**
INV-01 impede dois agendamentos no mesmo `scheduled_at`, mas não impede duas
consultas de 30 min começando com 10 min de diferença.
**Por que fica assim:** o requisito fala em "mesma hora" e o modelo do desafio não tem duração. A solução completa é `EXCLUDE USING gist (doctor_id WITH =, tsrange(...) WITH &&)` + extensão `btree_gist`.
**Gatilho de reabertura:** o dia em que a consulta ganhar campo de duração.

### DEBT-03 · BAIXO · arquitetura
**O texto que o usuário lê está colado na regra de negócio.**
Rigorosamente, texto de apresentação no domínio é acoplamento de camada.
**Por que fica assim:** um catálogo separado exigiria manter duas fontes de verdade para o mesmo texto, com ganho nulo nesta escala (ADR-06). O `code` estável já isola o cliente.
**Gatilho de reabertura:** internacionalização, ou um segundo canal de saída além do HTTP.

### DEBT-04 · MÉDIO · segurança
**Num navegador, o token de sessão ficaria ao alcance de script malicioso.**
O `refreshToken` volta no corpo da resposta do login; guardá-lo é responsabilidade
de quem consome a API. Em cookie `httpOnly` ele seria invisível a JavaScript.
**Por que fica assim:** o cliente é REST genérico (Swagger UI, Postman, avaliador). Cookie exigiria CSRF e CORS com credenciais sem contrapartida aqui.
**Gatilho de reabertura:** um SPA consumindo a API em navegador.

### DEBT-05 · MÉDIO · arquitetura
**Fora o agendamento, um retry de criação pode duplicar o registro.**
Não há header `Idempotency-Key`: dois `POST` idênticos criam dois recursos, exceto
onde o banco já tem chave única para barrar o segundo.
**Por que fica assim:** o agendamento tem chave natural única `(doctor_id, scheduled_at)` — um retry produz 409 determinístico, nunca duplicata (idempotência efetiva). Para os demais POSTs, o ganho não paga a mecânica de armazenar e expirar chaves.
**Gatilho de reabertura:** cliente com retry automático criando recursos sem chave natural.

### DEBT-06 · BAIXO · segurança
**Sessões vencidas nunca são apagadas do banco.**
Nenhuma rotina apaga refresh token expirado ou revogado: a tabela
`refresh_tokens` só cresce, acumulando linha morta.
**Por que fica assim:** exigiria scheduler, que não existe na POC.
**Gatilho de reabertura:** qualquer execução contínua além da avaliação.

### DEBT-07 · ALTO · segurança
**Nada impede tentar milhares de senhas no login.**
Não há rate limiting no `POST /auth/login` — nada impede força bruta.
**Por que fica assim:** `express-rate-limit` resolveria em poucas linhas, mas ficou fora para não inflar a superfície da POC. O custo de bcrypt (rounds 10) atrasa, não impede.
**Gatilho de reabertura:** exposição da API fora de `localhost`.

### DEBT-08 · MÉDIO · domínio
**Todo mundo que entra no sistema é médico — não existe recepcionista nem administrador.**
**Por que fica assim:** o desafio descreve uma única persona. Modelar papéis sem um segundo papel real é abstração antecipada — e vira code-smell na avaliação.
**Ponto de extensão:** `doctors` → `users` + `roles`, com `doctor_id` virando `owner_id`.
**Gatilho de reabertura:** recepcionista, clínica com vários médicos, ou perfil administrativo.

### DEBT-09 · BAIXO · performance
**Listagens ficam lentas conforme o usuário avança para as páginas do fim.**
Degrada em tabelas grandes: `OFFSET 10000` varre 10 mil linhas.
**Por que fica assim:** irrelevante na escala de um consultório; cursor complicaria o contrato sem ganho observável.
**Gatilho de reabertura:** listagem passando de alguns milhares de linhas.

### DEBT-10 · MÉDIO · domínio
**A agenda ignora fuso horário: quem está em outro fuso vê a hora trocada.**
"Mesma hora" é comparada em UTC — correto para o requisito, insuficiente para agenda real com horário de verão ou médico em outro fuso.
**Por que fica assim:** o desafio não menciona fuso, e `timestamptz` já guarda o instante corretamente.
**Gatilho de reabertura:** exibir agenda para usuário em fuso diferente do servidor.

### DEBT-11 · MÉDIO · segurança
**Sessão roubada continua valendo por até 8 horas, e ninguém percebe.**
O token é opaco, guardado só como SHA-256 e revogável — mas não é trocado a cada
uso, então não há como detectar que uma cópia está sendo usada em paralelo.
**Por que fica assim:** o enunciado pede "login/logout, token JWT" como item *desejável*. A versão com rotação exigiria `family_id`, auto-FK `replaced_by`, revogação em cascata, janela de graça para não derrubar sessão legítima por refresh concorrente, e os três testes mais frágeis da suíte — complexidade que o avaliador teria de destrinchar sem que nenhum requisito a peça (ADR-11, [PLAN.md §3.1](PLAN.md)).
**Mitigação em vigor:** TTL de 8 horas (a sessão morre no fim do turno), `revoked_at` no logout, INV-06 (nunca se grava o token cru).
**Gatilho de reabertura:** qualquer exposição fora de `localhost`, ou o primeiro usuário real.

### DEBT-12 · MÉDIO · arquitetura
**Qualquer violação de unicidade no banco responde "Já existe um agendamento neste horário".**
O `AllExceptionsFilter` traduz o `23505` do Postgres para 409 `SCHEDULE_CONFLICT`
sem olhar **qual** constraint falhou. Enquanto a agenda (INV-01) for a única
unicidade alcançável por requisição, a mensagem está sempre certa; na segunda, ela
passa a mentir com cara de verdade.
**Por que fica assim:** mapear constraint → mensagem exige uma tabela de nomes de índice dentro do filtro — nome de objeto de banco vazando para a borda HTTP — para um caso que ainda não existe (o médico nasce por seed, não por endpoint).
**Mitigação em vigor:** o texto do driver, com o nome da constraint, vai para o log em `warn`: qual índice estourou é sempre recuperável.
**Gatilho de reabertura:** a segunda constraint `UNIQUE` alcançável por endpoint.
<!-- /§abertos -->

---

<!-- §resolvidos -->
## Resolvidos

_(vazio — nenhum débito fechado até aqui)_

Formato ao fechar: mover a entrada inteira para cá, acrescentando **Resolvido em:**
(fase e commit) e **Como:** (a mudança concreta). O número nunca é reaproveitado.
<!-- /§resolvidos -->
