import { DataSource } from 'typeorm';

/**
 * A ordem inversa das dependências — filha antes da mãe. `TRUNCATE` recusa uma
 * tabela referenciada por FK se a referenciadora não vier junto na mesma instrução.
 *
 * Existe como função, e não como string repetida em cada `*.e2e-spec.ts`, por
 * experiência direta: ao nascer `patients`, **todos** os testes de autenticação
 * quebraram com `cannot truncate a table referenced in a foreign key constraint` —
 * e a suíte de auth não tem nada a ver com pacientes. Cada tabela nova passa a
 * custar uma edição aqui, em vez de uma caçada por arquivo.
 *
 * `CASCADE` resolveria em uma palavra e é justamente o que não se quer: ele apaga o
 * que a lista não menciona, e um dia apagaria uma tabela que alguém queria manter.
 */
export async function truncateAll(dataSource: DataSource): Promise<void> {
  await dataSource.query('TRUNCATE TABLE patients, refresh_tokens, doctors');
}
