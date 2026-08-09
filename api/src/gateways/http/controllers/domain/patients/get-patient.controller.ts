import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { GetPatientService } from '@/domains/domain/services/patients/get-patient.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import { PatientHttpResponse, PatientPresenter } from '@/presentation/presenters/patient.presenter';

@ApiTags('pacientes')
@ApiBearerAuth()
@Controller('patients')
export class GetPatientController {
  constructor(private readonly getPatient: GetPatientService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Consulta o perfil de um paciente',
    description:
      'Paciente de outro médico responde **404**, igual ao inexistente: 403 confirmaria que o recurso existe.',
  })
  @ApiOkResponse({
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
  @ApiNotFoundResponse({
    description: 'Inexistente — ou de outro médico. A resposta é a mesma.',
    schema: {
      example: {
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      },
    },
  })
  async handle(
    @CurrentDoctor() doctorId: string,
    // `ParseUUIDPipe` antes do service: id malformado é 400 na borda, e sem ele o
    // Postgres recusaria o `uuid` inválido com um 500 vindo do driver.
    @Param('id', ParseUUIDPipe) patientId: string,
  ): Promise<PatientHttpResponse> {
    const result = await this.getPatient.execute({ doctorId, patientId });

    if (result.isLeft()) {
      throw result.value;
    }

    return PatientPresenter.toHttp(result.value);
  }
}
