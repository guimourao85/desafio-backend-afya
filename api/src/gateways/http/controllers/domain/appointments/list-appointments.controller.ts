import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { ListAppointmentsService } from '@/domains/domain/services/appointments/list-appointments.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import {
  AppointmentHttpResponse,
  AppointmentPresenter,
} from '@/presentation/presenters/appointment.presenter';
import {
  PaginatedHttpResponse,
  PaginatedPresenter,
} from '@/presentation/presenters/paginated.presenter';

import { ListAppointmentsQueryDto } from '../../../schemas/domain/appointment.schema';

/**
 * `GET /api/appointments` — a tela de agenda do médico.
 *
 * Todos os filtros são opcionais e se combinam: período, paciente e status. Sem
 * nenhum, devolve a agenda inteira paginada, da próxima consulta para o fim.
 *
 * Duas escolhas que o resumo do Swagger não conta: a lista vem sempre embrulhada
 * em `{ data, meta }` — nunca um array cru, para o cliente não descobrir o formato
 * rota a rota — e `perPage` tem teto de 100, senão uma query só puxaria a tabela
 * inteira.
 *
 * Mais detalhes: PRODUCT.md — INV-04.
 */
@ApiTags('agendamentos')
@ApiBearerAuth()
@Controller('appointments')
export class ListAppointmentsController {
  constructor(private readonly listAppointments: ListAppointmentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista a agenda do médico, com filtros combináveis',
    description: 'Sem filtro, devolve a agenda inteira paginada, da próxima consulta para o fim.',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01T00:00:00.000Z' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31T23:59:59.000Z' })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED'] })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'perPage', required: false, example: 20, description: 'Máximo 100.' })
  @ApiOkResponse({
    schema: {
      example: {
        data: [
          {
            id: '9c1f8b2e-6a4d-4f1a-9c3b-7e2d5a0b1c9f',
            patientId: '3f1c8b2e-6a4d-4f1a-9c3b-7e2d5a0b1c9f',
            scheduledAt: '2026-08-12T14:00:00.000Z',
            status: 'SCHEDULED',
            createdAt: '2026-08-09T18:00:00.000Z',
          },
        ],
        meta: { page: 1, perPage: 20, total: 1, totalPages: 1 },
      },
    },
  })
  async handle(
    @CurrentDoctor() doctorId: string,
    @Query() query: ListAppointmentsQueryDto,
  ): Promise<PaginatedHttpResponse<AppointmentHttpResponse>> {
    // O `doctorId` do token entra antes de qualquer filtro que o cliente mandou.
    // Numa listagem, esquecer isso não vaza um paciente: vaza a agenda inteira de
    // todos os consultórios de uma vez. (INV-04)
    const { items, total } = await this.listAppointments.execute({ doctorId, ...query });

    // `totalPages` nasce no presenter, não no caso de uso: quantas páginas existem
    // é aritmética de tela, não regra de agenda.
    return PaginatedPresenter.toHttp(
      items,
      total,
      query.page,
      query.perPage,
      AppointmentPresenter.toHttp,
    );
  }
}
