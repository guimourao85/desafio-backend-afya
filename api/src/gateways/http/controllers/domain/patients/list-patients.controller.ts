import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { ListPatientsService } from '@/domains/domain/services/patients/list-patients.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import {
  PaginatedHttpResponse,
  PaginatedPresenter,
} from '@/presentation/presenters/paginated.presenter';
import { PatientHttpResponse, PatientPresenter } from '@/presentation/presenters/patient.presenter';

import { ApiUnauthorizedErrorResponse } from '../../../decorators/api-unauthorized-error.decorator';
import { ApiValidationErrorResponse } from '../../../decorators/api-validation-error.decorator';
import { ListPatientsQueryDto } from '../../../schemas/domain/patient.schema';

/**
 * `GET /api/patients` — a lista de pacientes do médico, com busca por nome.
 *
 * Dois limites declarados de propósito: a busca ignora maiúscula e minúscula mas
 * **não** ignora acento — "alvares" não acha "Álvares" —, e `perPage` para em 100,
 * senão uma única query puxaria a base inteira.
 *
 * Base vazia é 200 com lista vazia, nunca 404: "você ainda não tem pacientes" é
 * uma resposta, não um erro.
 *
 * Mais detalhes: PRODUCT.md — INV-04.
 */
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
  // A query também passa pelo pipe global: `?perPage=999` é 400, não uma página
  // gigante — o teto de 100 mora no schema Zod, não numa checagem do controller.
  @ApiValidationErrorResponse({
    details: [{ path: 'perPage', message: 'O máximo por página é 100.' }],
  })
  @ApiUnauthorizedErrorResponse()
  async handle(
    @CurrentDoctor() doctorId: string,
    @Query() query: ListPatientsQueryDto,
  ): Promise<PaginatedHttpResponse<PatientHttpResponse>> {
    // O `doctorId` do token entra antes do termo de busca. Sem ele, procurar por
    // "maria" devolveria as Marias de todos os consultórios. (INV-04)
    const { items, total } = await this.listPatients.execute({ doctorId, ...query });

    // O presenter é a única via de saída: é ele que decide o que o cliente vê e o
    // que fica dentro do banco.
    return PaginatedPresenter.toHttp(items, total, query.page, query.perPage, PatientPresenter.toHttp);
  }
}
