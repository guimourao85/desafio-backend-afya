import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RegisterPatientService } from '@/domains/domain/services/patients/register-patient.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import { PatientHttpResponse, PatientPresenter } from '@/presentation/presenters/patient.presenter';

import { ApiUnauthorizedErrorResponse } from '../../../decorators/api-unauthorized-error.decorator';
import { ApiValidationErrorResponse } from '../../../decorators/api-validation-error.decorator';
import { RegisterPatientDto } from '../../../schemas/domain/patient.schema';

/**
 * `POST /api/patients` — cadastra um paciente.
 *
 * Só o nome é obrigatório. Telefone, email, nascimento, sexo, altura e peso são
 * todos opcionais: o cadastro precisa funcionar com o que o médico tem em mãos na
 * hora, não com a ficha completa.
 *
 * Email **não** é único — dois pacientes podem dividir o email de um familiar.
 *
 * O paciente nasce vinculado ao médico do token, e não existe forma de cadastrar
 * na base de outro: `doctorId` simplesmente não faz parte do corpo aceito.
 *
 * Mais detalhes: PRODUCT.md — INV-04.
 */
@ApiTags('pacientes')
@ApiBearerAuth()
@Controller('patients')
export class RegisterPatientController {
  constructor(private readonly registerPatient: RegisterPatientService) {}

  // Sem `@HttpCode`: `@Post` já responde 201, e aqui um recurso **é** criado —
  // diferente do login, que abre sessão e por isso desce para 200.
  @Post()
  @ApiOperation({
    summary: 'Cadastra um paciente na base do médico autenticado',
    description: 'Só o nome é obrigatório. O paciente nasce vinculado ao médico do token.',
  })
  /**
   * **O exemplo existe para o botão Execute funcionar de primeira.** Sem ele o
   * Swagger UI monta o corpo a partir do schema e produz `birthDate: "8063-81-66"`
   * — casa com o `pattern` de `AAAA-MM-DD` e não é uma data —, então o primeiro
   * `POST` que o avaliador executa depois de autenticar responde 400. Verificado no
   * browser em 10/08/2026.
   *
   * `type` junto com `examples`: o schema continua saindo do Zod (ADR-07), e o que
   * se acrescenta é só o payload de exemplo. Nenhum `@ApiProperty` no DTO.
   */
  @ApiBody({
    type: RegisterPatientDto,
    examples: {
      completo: {
        summary: 'Ficha completa',
        value: {
          name: 'Marina Duarte',
          phone: '(11) 90000-0004',
          email: 'marina@example.com',
          birthDate: '1990-04-18',
          sex: 'FEMALE',
          heightM: 1.62,
          weightKg: 58.5,
        },
      },
      minimo: {
        summary: 'Só o nome — o resto entra depois',
        value: { name: 'Marina Duarte' },
      },
    },
  })
  @ApiCreatedResponse({
    schema: {
      example: {
        id: '3f1c8b2e-6a4d-4f1a-9c3b-7e2d5a0b1c9f',
        name: 'Pedro Álvares',
        phone: '(11) 99999-9999',
        email: 'pedro@example.com',
        birthDate: '1987-01-01',
        sex: 'MALE',
        heightM: 1.68,
        weightKg: 75,
        anonymized: false,
        createdAt: '2026-08-09T18:00:00.000Z',
      },
    },
  })
  @ApiValidationErrorResponse({
    details: [{ path: 'name', message: 'O nome é obrigatório.' }],
  })
  @ApiUnauthorizedErrorResponse()
  async handle(
    @CurrentDoctor() doctorId: string,
    @Body() body: RegisterPatientDto,
  ): Promise<PatientHttpResponse> {
    // `doctorId` vem do token, nunca do corpo: o `.strict()` do schema recusaria o
    // campo, e esta linha é a razão de ele nunca ter existido lá (INV-04).
    const patient = await this.registerPatient.execute({ doctorId, ...body });

    return PatientPresenter.toHttp(patient);
  }
}
