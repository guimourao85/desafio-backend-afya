# Roteiro de avaliação, executado por máquina

Este diretório prova que o [Roteiro de avaliação do README](../../../README.md#roteiro)
funciona de ponta a ponta **antes** de um avaliador humano segui-lo. O script abre o
Swagger real (`/api/docs`) num Chromium controlado por Playwright e faz exatamente o
que o roteiro manda: expande a rota, clica **Try it out**, aceita ou edita o exemplo,
clica **Execute** e lê o status e o corpo **na própria UI** — não por HTTP direto.

## Por que isso existe

A suíte e2e (`api/test/integration/`) prova as rotas por HTTP, mas não prova a
**camada que o avaliador usa**: os exemplos pré-preenchidos, o botão Authorize, o
fluxo Execute. Foi dirigindo a UI que esta validação encontrou duas divergências que
o e2e não tinha como ver — um exemplo que pré-preenchia a busca e escondia a listagem
do passo 4, e um texto do passo 10 que prometia a anonimização visível numa rota que
não a mostra (issues 8 e 9 do sub-doc da sprint 05.02). Roteiro que só funciona na
intenção não protege a primeira impressão de ninguém.

## Como rodar

Exceção declarada ao "só Docker" do README principal: isto é ferramenta de
desenvolvimento, não gate de avaliação — precisa de **Node 22+ no host**, porque o
browser roda fora do container.

```bash
# com o ambiente de pé e o seed aplicado (passos 1–7 do README principal):
npm install
npx playwright install chromium   # só na primeira vez
npm run roteiro
```

Saída: uma linha `PASS`/`FAIL` por verificação (18 no total), screenshots de cada
passo em `shots/` e o resumo em `resultado.json`.

**O script cria dados próprios** (um paciente e duas consultas em 2027), como o
roteiro manda. Para re-rodar do mesmo estado, recrie a base primeiro:
`docker compose down -v && docker compose up -d` + migrations + seed — sem isso o
passo 5 falha com 409, porque o horário da rodada anterior segue ocupado.
