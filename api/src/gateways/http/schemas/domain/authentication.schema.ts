import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * O corpo do `POST /api/auth/login`.
 *
 * A normalização do email acontece **aqui**, na borda, e não no caso de uso: caixa
 * e espaço são questão de formato, não de negócio. Sem `trim` + `toLowerCase`,
 * `uk_doctors_email` não impede ` Medico@X ` e `medico@x` de coexistirem, e o login
 * passa a falhar por um motivo que não aparece em lugar nenhum.
 *
 * `.strict()` porque campo extra num payload de autenticação é sinal de cliente
 * desalinhado — melhor 400 explícito do que ignorar em silêncio.
 */
export const authenticateDoctorSchema = z
  .object({
    email: z
      .string({ required_error: 'O email é obrigatório.' })
      .trim()
      .toLowerCase()
      .email('Informe um email válido.'),
    // `min(1)`, não `min(8)`: isto é login, não cadastro. Senha curta é credencial
    // errada — 401 pelo caso de uso —, não payload malformado.
    password: z.string({ required_error: 'A senha é obrigatória.' }).min(1, 'A senha é obrigatória.'),
  })
  .strict();

export class AuthenticateDoctorDto extends createZodDto(authenticateDoctorSchema) {}
