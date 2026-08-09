import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { PatientSex } from '@/domains/domain/model-entities/patient.entity';

const MAX_PER_PAGE = 100;

/**
 * As regras de **formato** do paciente, todas na borda (PLAN.md §12.1).
 *
 * As faixas de altura e peso repetem os `CHECK` do banco de propósito: aqui elas
 * devolvem 400 com o campo apontado, lá são a última linha para o que não passa
 * por HTTP (seed, script, correção manual). Duas camadas para a mesma regra, com
 * papéis diferentes.
 */
const patientFields = {
  name: z
    .string({ required_error: 'O nome é obrigatório.' })
    .trim()
    .min(1, 'O nome é obrigatório.')
    .max(150, 'O nome deve ter no máximo 150 caracteres.'),

  phone: z
    .string()
    .trim()
    .max(20, 'O telefone deve ter no máximo 20 caracteres.')
    .nullable()
    .optional(),

  // Sem formato de telefone: o wireframe aceita `(11) 99999-9999` e o mundo real
  // aceita mais formatos do que qualquer regex acerta. Comprimento é limite real;
  // máscara é preferência de tela.
  email: z.string().trim().toLowerCase().email('Informe um email válido.').nullable().optional(),

  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'A data de nascimento deve estar no formato AAAA-MM-DD.')
    // `refine` e não `z.coerce.date()`: o contrato publica `'1987-01-01'`, e
    // converter para `Date` reintroduziria fuso num campo que não tem fuso.
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Informe uma data de nascimento válida.')
    .refine(
      (value) => value <= new Date().toISOString().slice(0, 10),
      'A data de nascimento não pode estar no futuro.',
    )
    .nullable()
    .optional(),

  sex: z
    .nativeEnum(PatientSex, {
      errorMap: () => ({ message: 'Sexo deve ser MALE, FEMALE, OTHER ou UNDISCLOSED.' }),
    })
    .nullable()
    .optional(),

  heightM: z
    .number()
    .gt(0.3, 'A altura deve ser maior que 0,30 m.')
    .lt(2.6, 'A altura deve ser menor que 2,60 m.')
    .nullable()
    .optional(),

  weightKg: z
    .number()
    .gt(0.5, 'O peso deve ser maior que 0,5 kg.')
    .lt(500, 'O peso deve ser menor que 500 kg.')
    .nullable()
    .optional(),
};

/**
 * A mensagem do `.strict()` **precisa** ser declarada: sem argumento, o Zod devolve
 * `"Unrecognized key(s) in object: 'x'"` — inglês e jargão de lib chegando ao
 * cliente, contra ADR-13. Descoberto no teste empírico desta sprint, e o mesmo
 * defeito existia no login desde 02.01.
 */
const UNKNOWN_FIELD_MESSAGE = 'Campo desconhecido no corpo da requisição.';

/** `POST /api/patients` — só o nome é obrigatório (PRODUCT.md §regras). */
export const registerPatientSchema = z.object(patientFields).strict(UNKNOWN_FIELD_MESSAGE);

export class RegisterPatientDto extends createZodDto(registerPatientSchema) {}

/**
 * `PATCH /api/patients/:id` — todos os campos opcionais, **e pelo menos um**.
 *
 * O `refine` existe porque corpo vazio é payload malformado, não sucesso silencioso:
 * sem ele, `PATCH {}` responderia 200 devolvendo o paciente intacto, e o cliente
 * concluiria que sua edição foi aplicada.
 */
export const updatePatientSchema = z
  .object({ ...patientFields, name: patientFields.name.optional() })
  .strict(UNKNOWN_FIELD_MESSAGE)
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

export class UpdatePatientDto extends createZodDto(updatePatientSchema) {}

/**
 * A query da listagem. `coerce` porque query string é sempre texto — sem ele,
 * `page=2` chegaria como `'2'` e a aritmética de `OFFSET` produziria `'2'-1`.
 */
export const listPatientsQuerySchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().positive('A página deve ser maior que zero.').default(1),
    // Teto explícito: sem ele, `?perPage=999999` é um SELECT da tabela inteira
    // servido por um parâmetro de query.
    perPage: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_PER_PAGE, `O máximo por página é ${MAX_PER_PAGE}.`)
      .default(20),
  })
  .strict('Parâmetro de busca desconhecido.');

export class ListPatientsQueryDto extends createZodDto(listPatientsQuerySchema) {}
