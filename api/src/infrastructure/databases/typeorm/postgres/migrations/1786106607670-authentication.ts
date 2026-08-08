import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A primeira migration do projeto: as duas tabelas de autenticação (PLAN.md §6.2).
 *
 * **Gerada e revisada.** O gerador produziu os `CREATE TABLE`, os cinco nomes de
 * constraint e o índice. O que ele **não** produz é a foreign key — e por escolha
 * nossa: `RefreshToken` referencia o médico por ID puro, sem `@ManyToOne`, porque
 * são agregados distintos (ADR-04). A integridade referencial, porém, é decisão de
 * *persistência* e não depende de relação no modelo — então ela entra aqui, à mão,
 * no `up()` e no `down()`.
 *
 * Forward-only: uma vez aplicada, este arquivo não se edita. Correção vem em
 * migration nova.
 */
export class Authentication1786106607670 implements MigrationInterface {
  name = 'Authentication1786106607670';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `doctors` primeiro — a FK abaixo referencia esta tabela.
    await queryRunner.query(
      `CREATE TABLE "doctors" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(150) NOT NULL, "email" character varying(255) NOT NULL, "password_hash" character varying(255) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uk_doctors_email" UNIQUE ("email"), CONSTRAINT "pk_doctors" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "doctor_id" uuid NOT NULL, "token_hash" character(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uk_refresh_tokens_hash" UNIQUE ("token_hash"), CONSTRAINT "pk_refresh_tokens" PRIMARY KEY ("id"))`,
    );
    // Motivo do índice (`review-database.md §regras`/Índices): **performance**. Serve
    // à revogação em massa por médico do logout de 02.02 — sem ele, cada logout
    // varre a tabela inteira de sessões. Não é índice "por precaução": a consulta
    // que o usa está especificada.
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_doctor" ON "refresh_tokens" ("doctor_id")`,
    );

    // ↓ Acrescentado na revisão — o gerador não emite FK sem relação na entity.
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "fk_refresh_tokens_doctors" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Ordem inversa exata do `up()`. O `DROP TABLE` levaria a FK junto, mas o
    // descarte explícito mantém o `down()` legível como o espelho do `up()`.
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "fk_refresh_tokens_doctors"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_doctor"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "doctors"`);
  }
}
