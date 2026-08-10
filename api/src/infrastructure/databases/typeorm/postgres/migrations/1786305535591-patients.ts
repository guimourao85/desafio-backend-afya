import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A tabela de pacientes (PLAN.md §6.2) — o primeiro dado clínico do sistema.
 *
 * **Gerada e revisada, e a revisão não foi formalidade.** O gerador emitiu, como
 * primeira linha do `up()`:
 *
 * ```sql
 * ALTER TABLE "refresh_tokens" DROP CONSTRAINT "fk_refresh_tokens_doctors"
 * ```
 *
 * Ele compara o schema real com as entities e conclui que aquela FK é sobra — ela
 * existe no banco mas não aparece em decorator nenhum, porque agregados se
 * referenciam por ID (ADR-04) e a FK entrou à mão na migration de autenticação
 * (`1786106607670-authentication.ts`). A linha foi
 * **removida** daqui, junto do `ADD CONSTRAINT` correspondente no `down()`.
 *
 * Consequência permanente, registrada em `PLAN.md §16.4`: **toda** migration gerada
 * daqui em diante tentará derrubar as FKs escritas à mão. Revisar não é etapa de
 * capricho — é o que impede o gerador de desfazer integridade referencial em silêncio.
 *
 * Forward-only: uma vez aplicada, este arquivo não se edita.
 */
export class Patients1786305535591 implements MigrationInterface {
  name = 'Patients1786305535591';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "patients" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "doctor_id" uuid NOT NULL, "name" character varying(150) NOT NULL, "phone" character varying(20), "email" character varying(255), "birth_date" date, "sex" character varying(20), "height_m" numeric(3,2), "weight_kg" numeric(5,2), "anonymized_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_patients_birth_date" CHECK (birth_date IS NULL OR birth_date <= CURRENT_DATE), CONSTRAINT "ck_patients_weight" CHECK (weight_kg IS NULL OR (weight_kg > 0.50 AND weight_kg < 500)), CONSTRAINT "ck_patients_height" CHECK (height_m IS NULL OR (height_m > 0.30 AND height_m < 2.60)), CONSTRAINT "ck_patients_sex" CHECK (sex IS NULL OR sex IN ('MALE','FEMALE','OTHER','UNDISCLOSED')), CONSTRAINT "pk_patients" PRIMARY KEY ("id"))`,
    );
    // Motivo (`review-database.md §regras`/Índices): **performance**. Toda consulta
    // de paciente filtra por médico (INV-04) — sem o índice, cada listagem varre a
    // tabela inteira, de todos os consultórios, para devolver a de um.
    await queryRunner.query(`CREATE INDEX "idx_patients_doctor" ON "patients" ("doctor_id")`);

    // ↓ Acrescentado na revisão — o gerador não emite FK sem relação na entity.
    await queryRunner.query(
      `ALTER TABLE "patients" ADD CONSTRAINT "fk_patients_doctors" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Ordem inversa exata do `up()`. O `DROP TABLE` levaria a FK junto, mas o
    // descarte explícito mantém o `down()` legível como espelho do `up()`.
    await queryRunner.query(`ALTER TABLE "patients" DROP CONSTRAINT "fk_patients_doctors"`);
    await queryRunner.query(`DROP INDEX "public"."idx_patients_doctor"`);
    await queryRunner.query(`DROP TABLE "patients"`);
  }
}
