import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RegisterPatientService } from '@/domains/domain/services/patients/register-patient.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import { PatientHttpResponse, PatientPresenter } from '@/presentation/presenters/patient.presenter';

import { RegisterPatientDto } from '../../../schemas/domain/patient.schema';

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
