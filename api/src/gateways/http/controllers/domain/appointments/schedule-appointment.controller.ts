import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { ScheduleAppointmentService } from '@/domains/domain/services/appointments/schedule-appointment.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import {
  AppointmentHttpResponse,
  AppointmentPresenter,
} from '@/presentation/presenters/appointment.presenter';

import { ScheduleAppointmentDto } from '../../../schemas/domain/appointment.schema';

/**
 * `POST /api/appointments` — marca uma consulta. É a rota que carrega a regra
 * central do sistema.
 *
 * Três coisas precisam ser verdade para o 201 sair: o paciente é deste médico
 * (senão 404), ele não foi anonimizado por pedido de LGPD (senão 422) e o horário
 * está livre (senão 409).
 *
 * "Livre" quer dizer que não há outra consulta **não cancelada** do mesmo médico
 * naquele instante exato. Cancelar devolve o horário para a agenda.
 *
 * Mais detalhes: PRODUCT.md — INV-01, INV-02, INV-04.
 */
@ApiTags('agendamentos')
@ApiBearerAuth()
@Controller('appointments')
export class ScheduleAppointmentController {
  constructor(private readonly scheduleAppointment: ScheduleAppointmentService) {}

  @Post()
  @ApiOperation({
    summary: 'Marca uma consulta para um paciente do médico',
    description:
      'Recusa com **409** se já houver consulta não cancelada do mesmo médico no mesmo instante. Cancelar libera o horário de volta.',
  })
  @ApiCreatedResponse({
    schema: {
      example: {
        id: '9c1f8b2e-6a4d-4f1a-9c3b-7e2d5a0b1c9f',
        patientId: '3f1c8b2e-6a4d-4f1a-9c3b-7e2d5a0b1c9f',
        scheduledAt: '2026-08-12T14:00:00.000Z',
        status: 'SCHEDULED',
        createdAt: '2026-08-09T18:00:00.000Z',
      },
    },
  })
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
  @ApiConflictResponse({
    description: 'Já existe consulta não cancelada neste horário.',
    schema: {
      example: {
        statusCode: 409,
        code: 'SCHEDULE_CONFLICT',
        message: 'Já existe um agendamento neste horário.',
      },
    },
  })
  @ApiUnprocessableEntityResponse({
    description: 'O paciente foi anonimizado (LGPD).',
    schema: {
      example: {
        statusCode: 422,
        code: 'BUSINESS_RULE_VIOLATION',
        message: 'Paciente anonimizado (LGPD) não pode receber novos agendamentos.',
      },
    },
  })
  async handle(
    @CurrentDoctor() doctorId: string,
    @Body() body: ScheduleAppointmentDto,
  ): Promise<AppointmentHttpResponse> {
    // O `doctorId` vem do token e é espalhado sobre o corpo, nunca o contrário: o
    // schema é `.strict()`, então mandar `doctorId` no JSON responde 400. Se ele
    // pudesse chegar pelo corpo, qualquer médico agendaria na agenda de qualquer
    // outro. (INV-04)
    const result = await this.scheduleAppointment.execute({ doctorId, ...body });

    if (result.isLeft()) {
      // `throw` entrega o erro ao filtro global, que traduz para status e mensagem.
      throw result.value;
    }

    return AppointmentPresenter.toHttp(result.value);
  }
}
