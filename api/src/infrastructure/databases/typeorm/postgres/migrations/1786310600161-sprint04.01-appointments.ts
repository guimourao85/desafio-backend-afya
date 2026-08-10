import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A tabela da agenda (PLAN.md §6.2) — e o índice que sustenta INV-01.
 *
 * **Gerada e revisada.** O gerador trouxe, como duas primeiras linhas do `up()`:
 *
 * ```sql
 * ALTER TABLE "patients"       DROP CONSTRAINT "fk_patients_doctors"
 * ALTER TABLE "refresh_tokens" DROP CONSTRAINT "fk_refresh_tokens_doctors"
 * ```
 *
 * Exatamente a armadilha de `PLAN.md §16.4`, agora com **duas** FKs em vez de uma —
 * ela cresce a cada FK escrita à mão. As linhas foram removidas daqui e do `down()`,
 * onde vinham como `ADD CONSTRAINT` e faziam o par parecer coerente.
 *
 * O que o gerador **acertou** e vale registrar: o `WHERE status <> 'CANCELLED'` do
 * índice parcial saiu no SQL. Ele é a diferença entre "cancelar libera o horário" e
 * "o horário fica queimado para sempre".
 *
 * Forward-only: uma vez aplicada, este arquivo não se edita.
 */
export class Sprint0401Appointments1786310600161 implements MigrationInterface {
  name = 'sprint0401Appointments1786310600161';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "appointments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "doctor_id" uuid NOT NULL, "patient_id" uuid NOT NULL, "scheduled_at" TIMESTAMP WITH TIME ZONE NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'SCHEDULED', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_appointments_status" CHECK (status IN ('SCHEDULED','COMPLETED','CANCELLED')), CONSTRAINT "pk_appointments" PRIMARY KEY ("id"))`,
    );
    // Motivo: **performance**. Serve ao filtro `?patientId=` da agenda e à linha do
    // tempo do paciente — as duas leem por paciente; a linha do tempo lê do mais
    // recente para trás, e o btree é varrido ao contrário com o mesmo custo.
    await queryRunner.query(
      `CREATE INDEX "idx_appointments_patient" ON "appointments" ("patient_id", "scheduled_at")`,
    );
    // Motivo: **integridade** — é INV-01. O `WHERE` é o que exclui as canceladas da
    // unicidade: sem ele, cancelar não devolveria o horário à agenda. É também a
    // única camada que fecha a corrida entre duas requisições simultâneas, já que a
    // verificação do caso de uso roda antes de qualquer uma gravar.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_appointments_doctor_slot" ON "appointments" ("doctor_id", "scheduled_at") WHERE status <> 'CANCELLED'`,
    );

    // ↓ Acrescentadas na revisão — o gerador não emite FK sem relação na entity.
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "fk_appointments_doctors" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "fk_appointments_patients" FOREIGN KEY ("patient_id") REFERENCES "patients"("id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Ordem inversa exata do `up()`.
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "fk_appointments_patients"`,
    );
    await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "fk_appointments_doctors"`);
    await queryRunner.query(`DROP INDEX "public"."uk_appointments_doctor_slot"`);
    await queryRunner.query(`DROP INDEX "public"."idx_appointments_patient"`);
    await queryRunner.query(`DROP TABLE "appointments"`);
  }
}
