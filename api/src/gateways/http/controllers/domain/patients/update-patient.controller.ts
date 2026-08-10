import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { UpdatePatientService } from '@/domains/domain/services/patients/update-patient.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import { PatientHttpResponse, PatientPresenter } from '@/presentation/presenters/patient.presenter';

import { UpdatePatientDto } from '../../../schemas/domain/patient.schema';

/**
 * `PATCH /api/patients/:id` — corrige o cadastro de um paciente.
 *
 * `PATCH` de verdade: só os campos enviados mudam. A diferença entre omitir e
 * mandar `null` é significativa — `phone: null` **apaga** o telefone, enquanto não
 * mandar `phone` o deixa como está.
 *
 * Corpo vazio é 400, não 200: sem isso, `PATCH {}` devolveria o paciente intacto e
 * o cliente concluiria que a edição foi aplicada.
 *
 * Paciente anonimizado responde 422 — aceitar a edição reintroduziria pela porta
 * dos fundos os dados pessoais que alguém pediu para apagar.
 *
 * Mais detalhes: PRODUCT.md — INV-02, INV-04.
 */
@ApiTags('pacientes')
@ApiBearerAuth()
@Controller('patients')
export class UpdatePatientController {
  constructor(private readonly updatePatient: UpdatePatientService) {}

  @Patch(':id')
  @ApiOperation({
    summary: 'Corrige o perfil de um paciente',
    description:
      'Só os campos enviados mudam. Enviar `null` **apaga** o campo; omitir o deixa como está. Corpo vazio é 400.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        id: '3f1c8b2e-6a4d-4f1a-9c3b-7e2d5a0b1c9f',
        name: 'Pedro Álvares Cabral',
        phone: '(11) 98888-7777',
        email: 'pedro@example.com',
        birthDate: '1987-01-01',
        sex: 'MALE',
        heightM: 1.68,
        weightKg: 76.5,
        anonymized: false,
        createdAt: '2026-08-09T18:00:00.000Z',
      },
    },
  })
  @ApiNotFoundResponse({
    schema: {
      example: {
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      },
    },
  })
  @ApiUnprocessableEntityResponse({
    description: 'O paciente foi anonimizado (LGPD) e não aceita mais edição.',
    schema: {
      example: {
        statusCode: 422,
        code: 'BUSINESS_RULE_VIOLATION',
        message: 'Paciente anonimizado (LGPD) não pode ser editado.',
      },
    },
  })
  async handle(
    @CurrentDoctor() doctorId: string,
    @Param('id', ParseUUIDPipe) patientId: string,
    @Body() body: UpdatePatientDto,
  ): Promise<PatientHttpResponse> {
    // `doctorId` do token + `patientId` da URL: os dois entram no `WHERE`. Editar o
    // paciente de outro médico não é 403, é 404 — o mesmo que não existir. (INV-04)
    const result = await this.updatePatient.execute({ doctorId, patientId, ...body });

    if (result.isLeft()) {
      // `throw` entrega o erro ao filtro global, que traduz para status e mensagem.
      throw result.value;
    }

    return PatientPresenter.toHttp(result.value);
  }
}
