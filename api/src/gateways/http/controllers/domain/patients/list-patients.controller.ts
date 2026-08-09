import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { ListPatientsService } from '@/domains/domain/services/patients/list-patients.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import {
  PaginatedHttpResponse,
  PaginatedPresenter,
} from '@/presentation/presenters/paginated.presenter';
import { PatientHttpResponse, PatientPresenter } from '@/presentation/presenters/patient.presenter';

import { ListPatientsQueryDto } from '../../../schemas/domain/patient.schema';

@ApiTags('pacientes')
@ApiBearerAuth()
@Controller('patients')
export class ListPatientsController {
  constructor(private readonly listPatients: ListPatientsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista os pacientes do médico, com busca por nome',
    description:
      'A busca ignora caixa, mas **não** ignora acento. Base vazia devolve 200 com lista vazia, nunca 404.',
  })
  @ApiQuery({ name: 'search', required: false, example: 'pedro' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'perPage', required: false, example: 20, description: 'Máximo 100.' })
  @ApiOkResponse({
    schema: {
      example: {
        data: [
          {
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
        ],
        meta: { page: 1, perPage: 20, total: 1, totalPages: 1 },
      },
    },
  })
  async handle(
    @CurrentDoctor() doctorId: string,
    @Query() query: ListPatientsQueryDto,
  ): Promise<PaginatedHttpResponse<PatientHttpResponse>> {
    const { items, total } = await this.listPatients.execute({ doctorId, ...query });

    return PaginatedPresenter.toHttp(items, total, query.page, query.perPage, PatientPresenter.toHttp);
  }
}
