# Prova sob estresse

Este diretório é a **autoridade** sobre o que o projeto sabe a respeito de
concorrência e volume: o que foi provado, com que número, em que condição, e o que
continua sem prova. O [README principal](../../../README.md#prova-sob-estresse) traz
só a conclusão e aponta para cá.

Duas camadas de teste do projeto — `npm test` e `npm run test:e2e` — são
**determinísticas por construção** e não exercitam concorrência nem volume. Esta é a
terceira, e existe porque a garantia mais importante do domínio (INV-01: dois pacientes
nunca no mesmo horário do mesmo médico) **só se prova com requisições simultâneas**.

## Como rodar

Com o ambiente de pé (passos 1–7 do README principal). **Não há passo extra:** o
`docker compose up -d` já sobe o container `k6-prontomed` ocioso, e o comando resolve o
seed de volume sozinho antes de acionar o teste.

```bash
cd api && npm run test:stress
```

Leva cerca de um minuto. O script é orquestração — por isso roda **no host**, e não com
`docker exec` como o resto:

```jsonc
"test:stress": "docker exec api-prontomed npm run seed:load && docker exec k6-prontomed k6 run /scripts/stress-test.js"
```

A primeira metade é **pré-condição, não passo seu**: o `&&` faz disso condição, e sem
o volume o teste nem começa. Ela cria o médico de estresse
(`k6.stress@prontomed.dev`, fixture com par idêntico em `load.seed.ts`, que recusa
rodar fora de `APP_ENV=dev`) e as linhas que o cenário de carga precisa, e é
**idempotente** — a partir da segunda execução custa menos de um segundo e não
duplica nada.

`seed:load` existe como script npm só porque `test:stress` precisa invocá-lo por
dentro do container. **Não é comando de uso** e não aparece em nenhuma tabela de
scripts: não há caso em que chamá-lo à mão faça diferença.

## Os dois cenários

Estão em [`stress-test.js`](stress-test.js), com propósitos que não se misturam.

| Cenário       | Executor            | Configuração                     | O que mede                                                             |
| ------------- | ------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| `overbooking` | `shared-iterations` | 20 VUs, 20 iterações, sem `sleep` | **Corretude sob corrida** — 20 requisições simultâneas no mesmo horário |
| `load`        | `constant-vus`      | 5 VUs por 30 s, `startTime: 30s` | **Latência** p95/p99 nas três listagens paginadas                       |

Três detalhes de construção que não são estéticos:

- **`shared-iterations` com iterações == VUs.** Os 20 sobem juntos e cada um pega
  exatamente uma iteração. `startTime` escalonado ou `sleep` destruiriam a
  simultaneidade, que é a única coisa que o cenário mede.
- **`load` começa depois do `overbooking`.** Medir latência enquanto 20 VUs disputam
  uma linha mediria a disputa, não a leitura.
- **O horário disputado é literal (`2099-06-15T12:00:00.000Z`), nunca derivado do
  relógio.** Slot que muda a cada execução é data incontrolada, e o `setup()` não teria
  o que limpar de forma determinística. 2099 porque precisa nascer vazio: o seed de
  carga e o de demonstração param em 2027.

O `setup()` limpa o slot antes de começar — sem isso, um run abortado deixaria o
horário ocupado e o threshold reprovaria um sistema correto.

## O que a corrida provou

Resultado de `overbooking`, idêntico em **nove execuções** — três seguidas da medição
inicial, uma após restaurar o índice da contraprova, uma após as correções da revisão,
três após a mudança do compose e uma a partir de ambiente derrubado e resubido:

```
created_201{scenario:overbooking}   count=1
conflict_409{scenario:overbooking}  count=19
checks                              rate=100.00%
http_req_failed                     0.00%
```

O 409 que chega ao cliente é o `SCHEDULE_CONFLICT` do catálogo, não um 500 de
`QueryFailedError` vazando: a tradução `23505 → 409` do
`framework/filters/errors/exception-filter.ts` é exercitada de verdade aqui.

### A prova de que a prova testa

**Um teste de corrida pode ficar verde sem nunca ter havido corrida.** Se os VUs
serializarem, o pré-`SELECT` de `schedule-appointment.service.ts` pega o conflito antes
do banco e a saída fica **idêntica** à do sistema correto. Verde não distingue os dois
casos — e um teste que não distingue não prova nada.

Por isso a prova foi verificada **ao contrário**, com o índice único removido do banco:

| Índice `uk_appointments_doctor_slot` | `created_201` | `conflict_409` | Leitura                            |
| ------------------------------------ | ------------- | -------------- | ---------------------------------- |
| presente                             | **1**         | 19             | invariante mantida                 |
| **removido**                         | **12**        | 8              | **overbooking acontecendo**        |

A conclusão vem com número: **é o índice único parcial que fecha a corrida; o
pré-`SELECT` do caso de uso não.** Ele barrou 8 das 20 — as que chegaram depois de
alguém já ter gravado — e deixou passar 12. O pré-`SELECT` é conveniência de mensagem,
não integridade.

O procedimento exato (com a limpeza obrigatória antes de recriar o índice, sem a qual o
`CREATE UNIQUE INDEX` falha e o banco fica **sem** a defesa de INV-01) está em
[`sprint-06.01 §escopo`](../../docs/desenvolvimento/sprints/sprint-06.01-concorrencia-idempotencia-e-carga.md).

> Se o passo com o índice removido produzir `1× 201`, o teste é **falso-verde** — o
> pré-`SELECT` está mascarando por escalonamento e o k6 nunca provou a corrida. Nesse
> caso: issue aberta, não checkbox.

## O que a carga mediu

**Número sem volume não é medida.** Volume: **500 pacientes, 2.000 consultas e 667
anotações** do médico de estresse. Carga: 5 VUs constantes por 30 s, **4 execuções**;
vazão de 283 req/s medida na primeira. Ambiente: **Docker sobre WSL2, cliente e banco
na mesma máquina, máquina ociosa**. As faixas abaixo são o mínimo e o máximo dessas
quatro — nenhuma execução ociosa ficou de fora.

| Endpoint                                            | p95           | p99           | Débito aberto?                          |
| --------------------------------------------------- | ------------- | ------------- | --------------------------------------- |
| `GET /api/patients?search=` (`ILIKE`, sem índice de texto) | 11,65–13,07 ms | 15,68–16,94 ms | **Não** — dentro da faixa das outras duas |
| `GET /api/patients/:id/appointments` (`JOIN` das anotações) | 15,19–17,45 ms | 19,91–22,71 ms | **Não** — a mais cara, por motivo conhecido |
| `GET /api/appointments` (`OFFSET`, páginas 1 a 10)  | 11,32–12,70 ms | 14,54–16,94 ms | **Não** — DEBT-09 segue aberto sem número que o justifique |

### Não leia o milissegundo

O valor absoluto não transfere para nenhuma outra máquina, e há evidência disso na
própria medição — mesma máquina, mesmo código, mesmo volume:

| Condição                              | Vazão      | p95 busca | p95 timeline | p95 agenda |
| ------------------------------------- | ---------- | --------- | ------------ | ---------- |
| máquina ociosa (4×, tabela acima)     | 283 req/s  | 11,7–13,1 ms | 15,2–17,5 ms | 11,3–12,7 ms |
| máquina intermediária                 | 242 req/s  | 17,5 ms   | 23,3 ms      | 17,8 ms    |
| máquina ocupada                       | 194 req/s  | 30,6 ms   | 40,9 ms      | 30,3 ms    |

**2,5× de diferença conforme o que mais está rodando.** A variação não é ruído a
esconder — é o argumento: publicar a faixa com a condição que a produziu é o oposto de
vender o número de uma execução escolhida.

**O que sobrevive às sete execuções** é a **ordem relativa** das três rotas — timeline
> busca ≈ agenda, sem exceção. É ela que sustenta a conclusão: **nenhum débito de
performance foi aberto**, porque a rota mais cara é a que faz `JOIN`, não a que varre
texto (`ILIKE`) nem a que desloca página (`OFFSET`). Débito de performance sem número
medido é palpite, e nenhum requisito não-funcional deste desafio pede performance.

**A cauda não é constante**, e afirmar o contrário foi um erro corrigido na conferência
de 10/08/2026:

| Condição                                | p99 / p95     |
| --------------------------------------- | ------------- |
| máquina ociosa (4 execuções × 3 rotas)  | **1,28–1,37×** |
| sob contenção de CPU (3 × 3 rotas)      | **1,36–2,14×** |

Com a máquina livre a cauda é curta e previsível; sob disputa de CPU ela estica até
dobrar. Isso é comportamento de fila, não do código — e é mais um motivo para o número
absoluto não viajar.

## O que este comando não é

- **Não é regressão.** Nada o dispara sozinho: ele não roda em `npm run test:e2e` e não
  há CI neste projeto, por decisão (RNF-12). É **demonstração** — e um `test:e2e` verde
  nunca deve ser lido como prova de concorrência.
- **Não é benchmark.** Nenhum requisito do desafio pede performance; aqui não se
  persegue meta, registra-se número com o volume e a condição que o produziram.
- **Não cobre retry.** `POST` repetido criando recurso duplicado continua **sem prova**
  e sem mecanismo: não há `Idempotency-Key`, e isso é escolha declarada — só o
  agendamento tem chave natural que transforma o retry em 409. Ver **DEBT-05** em
  [`DEBITOS-TECNICOS.md`](../../docs/DEBITOS-TECNICOS.md).

## Onde está o resto

| Assunto                                                              | Autoridade                                                                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Registro das execuções, decisões da sprint, issues e scores          | [`sprint-06.01`](../../docs/desenvolvimento/sprints/sprint-06.01-concorrencia-idempotencia-e-carga.md)         |
| INV-01 e as demais invariantes                                       | [`PRODUCT.md §invariantes`](../../docs/PRODUCT.md)                                                             |
| O índice parcial e as decisões de banco                              | [`PRODUCT.md §banco`](../../docs/PRODUCT.md)                                                                   |
| Débitos, com severidade e gatilho de reabertura                      | [`DEBITOS-TECNICOS.md`](../../docs/DEBITOS-TECNICOS.md)                                                        |
| Estratégia de teste das outras duas camadas                          | [`api/README.md §Testes`](../../README.md#testes)                                                              |
