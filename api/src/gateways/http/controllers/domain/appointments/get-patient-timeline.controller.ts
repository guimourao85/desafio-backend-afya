import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { GetPatientTimelineService } from '@/domains/domain/services/appointments/get-patient-timeline.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import {
  PaginatedHttpResponse,
  PaginatedPresenter,
} from '@/presentation/presenters/paginated.presenter';
import {
  PatientTimelineItemHttpResponse,
  PatientTimelinePresenter,
} from '@/presentation/presenters/patient-timeline.presenter';

import { ApiUnauthorizedErrorResponse } from '../../../decorators/api-unauthorized-error.decorator';
import { ApiValidationErrorResponse } from '../../../decorators/api-validation-error.decorator';
import { PatientTimelineQueryDto } from '../../../schemas/domain/appointment.schema';

/**
 * O arquivo mora em `controllers/domain/appointments/` e a rota é `/patients`:
 * **o código segue o agregado, a URL segue o cliente**.
 * O dado é do `Appointment`; quem consome pensa "as consultas deste paciente". Pôr o
 * arquivo em `controllers/domain/patients/` faria o pacote de pacientes injetar um
 * service de agenda, invertendo a fronteira que `PRODUCT.md §dominios` desenha.
 */
@ApiTags('pacientes')
@ApiBearerAuth()
@Controller('patients')
export class GetPatientTimelineController {
  constructor(private readonly getPatientTimeline: GetPatientTimelineService) {}

  @Get(':id/appointments')
  @ApiOperation({
    summary: 'Linha do tempo do paciente: consultas com suas anotações',
    description:
      'Uma chamada devolve a história inteira — consultas do mais recente para trás, cada uma com as anotações na ordem em que foram escritas. **Canceladas aparecem**, com o `status`: histórico é registro, e esconder o cancelamento seria reescrevê-lo. Paciente anonimizado **mantém** a história (INV-03) — o esquecimento apaga a identidade, não o atendimento.',
  })
  // O `:id` é do **paciente**, embora a rota devolva consultas: é a assimetria que
  // o decorator existe para explicitar (sprint 05.01, decisão 10).
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'Identificador do **paciente** cuja história será lida.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'perPage', required: false, example: 20, description: 'Máximo 100.' })
  @ApiOkResponse({
    description: 'Paciente sem nenhuma consulta responde 200 com `data` vazio, nunca 404.',
    schema: {
      example: {
        data: [
          {
            id: '9c1f8b2e-6a4d-4f1a-9c3b-7e2d5a0b1c9f',
            scheduledAt: '2026-08-12T14:00:00.000Z',
            status: 'COMPLETED',
            notes: [
              {
                id: '5b7e3c1a-2d9f-4e8b-a1c6-0f4d7b2e9a35',
                content: 'Paciente apresentou vermelhidão na pele do antebraço direito.',
                createdAt: '2026-08-12T14:20:00.000Z',
              },
            ],
          },
          {
            id: '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d',
            scheduledAt: '2026-07-30T09:00:00.000Z',
            status: 'CANCELLED',
            notes: [],
          },
        ],
        meta: { page: 1, perPage: 20, total: 2, totalPages: 1 },
      },
    },
  })
  @ApiValidationErrorResponse({
    details: [{ path: 'page', message: 'A página deve ser maior que zero.' }],
  })
  @ApiUnauthorizedErrorResponse()
  @ApiNotFoundResponse({
    description: 'Paciente inexistente — ou de outro médico.',
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
    @Param('id', ParseUUIDPipe) patientId: string,
    @Query() query: PatientTimelineQueryDto,
  ): Promise<PaginatedHttpResponse<PatientTimelineItemHttpResponse>> {
    const result = await this.getPatientTimeline.execute({ doctorId, patientId, ...query });

    if (result.isLeft()) {
      throw result.value;
    }

    return PaginatedPresenter.toHttp(
      result.value.items,
      result.value.total,
      query.page,
      query.perPage,
      PatientTimelinePresenter.toHttp,
    );
  }
}
