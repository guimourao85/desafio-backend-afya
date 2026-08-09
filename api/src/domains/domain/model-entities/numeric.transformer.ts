import { ValueTransformer } from 'typeorm';

/**
 * O conserto de uma armadilha do TypeORM: coluna `numeric` volta do Postgres como
 * **string**. Sem isto, `heightM` chega ao presenter como `"1.68"` e a API publica
 * texto onde o contrato promete número (PLAN.md §6.4).
 *
 * Fica num arquivo próprio porque vale para **toda** coluna `numeric` futura — peso,
 * altura e o que vier. Repetir o objeto literal em cada `@Column` é a forma de
 * esquecê-lo em uma delas.
 *
 * O driver não é convencido a devolver número: `numeric` é arbitrário e não cabe
 * em `double` sem perda, então a lib entrega a representação exata e deixa a
 * conversão para quem conhece a faixa. Aqui a faixa é altura e peso de gente —
 * `Number` dá conta.
 */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null => (value === null ? null : Number(value)),
};
