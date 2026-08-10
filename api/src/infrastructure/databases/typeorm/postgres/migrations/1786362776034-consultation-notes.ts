import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A tabela da anotação de atendimento (PLAN.md §6.2) — a quinta e última do modelo.
 *
 * **Gerada e revisada.** O gerador trouxe, como quatro primeiras linhas do `up()`:
 *
 * ```sql
 * ALTER TABLE "appointments"   DROP CONSTRAINT "fk_appointments_doctors"
 * ALTER TABLE "appointments"   DROP CONSTRAINT "fk_appointments_patients"
 * ALTER TABLE "patients"       DROP CONSTRAINT "fk_patients_doctors"
 * ALTER TABLE "refresh_tokens" DROP CONSTRAINT "fk_refresh_tokens_doctors"
 * ```
 *
 * A armadilha de `PLAN.md §16.4` pela terceira vez, e ela cresce a cada FK escrita à
 * mão: como agregados se referenciam por ID puro (ADR-04), o gerador não vê relação
 * nenhuma nas entities e conclui que as quatro FKs do banco sobram. Removidas daqui e
 * do `down()`, onde voltavam como `ADD CONSTRAINT` e faziam o par parecer coerente.
 *
 * O que o gerador **acertou**, e que só acertou porque a entity declarou: os quatro
 * nomes (`pk_`, `fk_`, `idx_`, `ck_`), o `text` do conteúdo, os dois `timestamptz`,
 * e — diferente das outras três tabelas — **a FK saiu sozinha**. Aqui existe
 * `@ManyToOne`, porque a nota é entidade *interna* do agregado: navegar dentro de um
 * agregado é permitido, é entre agregados que ADR-04 proíbe.
 *
 * `ON DELETE NO ACTION` é explícito de propósito (sprint 04.02, decisão 15): apagar
 * fisicamente uma consulta que tem anotação **deve** falhar. `CASCADE` daria a um
 * `DELETE` manual o poder de sumir com registro clínico.
 *
 * Sem coluna `doctor_id` (decisão 9): o escopo por médico vem da raiz, e uma segunda
 * cópia dele aqui poderia divergir e apontar para outro consultório.
 *
 * Forward-only: uma vez aplicada, este arquivo não se edita.
 */
export class ConsultationNotes1786362776034 implements MigrationInterface {
  name = 'ConsultationNotes1786362776034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "consultation_notes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "appointment_id" uuid NOT NULL, "content" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_consultation_notes_content_not_empty" CHECK (length(btrim(content)) > 0), CONSTRAINT "pk_consultation_notes" PRIMARY KEY ("id"))`,
    );
    // Motivo: **performance**. Serve à linha do tempo (RF-06), que lê as anotações de
    // cada consulta na ordem em que foram escritas.
    await queryRunner.query(
      `CREATE INDEX "idx_consultation_notes_appointment" ON "consultation_notes" ("appointment_id", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "consultation_notes" ADD CONSTRAINT "fk_consultation_notes_appointments" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Ordem inversa exata do `up()`.
    await queryRunner.query(
      `ALTER TABLE "consultation_notes" DROP CONSTRAINT "fk_consultation_notes_appointments"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_consultation_notes_appointment"`);
    await queryRunner.query(`DROP TABLE "consultation_notes"`);
  }
}
