import { ValueTransformer } from 'typeorm';

/**
 * O conserto de uma armadilha silenciosa: coluna numérica de precisão exata volta
 * do Postgres como **texto**, não como número.
 *
 * Sem isto, a altura sai da API como `"1.68"` — entre aspas — onde o contrato
 * promete `1.68`. O cliente que fizer conta com esse valor recebe lixo, e nada
 * quebra até lá.
 *
 * Mora em arquivo próprio porque vale para **toda** coluna desse tipo, presente e
 * futura. Repetir o objeto em cada campo é a receita para esquecer em um deles.
 *
 * Por que o driver não devolve número sozinho: esse tipo de coluna guarda valores
 * de precisão arbitrária, que nem sempre cabem num número de ponto flutuante sem
 * perda. A biblioteca entrega a representação exata e deixa a conversão para quem
 * conhece a faixa de valores. Aqui a faixa é altura e peso de gente — cabe.
 *
 * Mais detalhes: PLAN.md §6.4.
 */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null => (value === null ? null : Number(value)),
};
