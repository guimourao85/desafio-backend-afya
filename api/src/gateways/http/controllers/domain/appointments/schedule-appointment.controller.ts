import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ScheduleAppointmentService } from '@/domains/domain/services/appointments/schedule-appointment.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import {
  AppointmentHttpResponse,
  AppointmentPresenter,
} from '@/presentation/presenters/appointment.presenter';

import {
  ApiBusinessRuleErrorResponse,
  ApiConflictErrorResponse,
  ApiNotFoundErrorResponse,
} from '../../../decorators/api-domain-error.decorator';
import { ApiUnauthorizedErrorResponse } from '../../../decorators/api-unauthorized-error.decorator';
import { ApiValidationErrorResponse } from '../../../decorators/api-validation-error.decorator';
import { ScheduleAppointmentDto } from '../../../schemas/domain/appointment.schema';

/**
 * `POST /api/appointments` — a rota que carrega a regra central do sistema.
 *
 * Para o 201 sair: o paciente é deste médico (senão 404), não foi anonimizado
 * (senão 422) e o horário está livre (senão 409). "Livre" é não haver outra consulta
 * **não cancelada** naquele instante — cancelar devolve o horário.
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
  // O segundo exemplo usa o instante que o seed deixa ocupado: executá-lo demonstra
  // o 409 sem preparar nada. O `patientId` é colado à mão porque nasce no banco.
  @ApiBody({
    type: ScheduleAppointmentDto,
    examples: {
      horarioLivre: {
        summary: 'Horário livre — 201',
        value: {
          patientId: 'cole-o-id-de-GET-/api/patients',
          scheduledAt: '2027-06-01T13:00:00.000Z',
        },
      },
      horarioOcupado: {
        summary: 'Mesmo instante da consulta do seed — 409 (INV-01)',
        value: {
          patientId: 'cole-o-id-de-GET-/api/patients',
          scheduledAt: '2027-05-15T14:00:00.000Z',
        },
      },
    },
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
  @ApiValidationErrorResponse({
    details: [
      { path: 'patientId', message: 'Informe um identificador de paciente válido.' },
      {
        path: 'scheduledAt',
        message: 'Informe um instante ISO-8601 (ex.: 2026-08-12T14:00:00.000Z).',
      },
    ],
  })
  @ApiUnauthorizedErrorResponse()
  @ApiNotFoundErrorResponse({
    description: 'Paciente inexistente — ou de outro médico.',
    message: 'Paciente não encontrado.',
  })
  @ApiConflictErrorResponse({
    description: 'Já existe consulta não cancelada neste horário.',
    message: 'Já existe um agendamento neste horário.',
  })
  @ApiBusinessRuleErrorResponse({
    description: 'O paciente foi anonimizado (LGPD).',
    message: 'Paciente anonimizado (LGPD) não pode receber novos agendamentos.',
  })
  async handle(
    @CurrentDoctor() doctorId: string,
    @Body() body: ScheduleAppointmentDto,
  ): Promise<AppointmentHttpResponse> {
    // `doctorId` vem do token, nunca do corpo: se chegasse pelo JSON, qualquer médico
    // agendaria na agenda de qualquer outro. O schema é `.strict()` e recusa com 400.
    const result = await this.scheduleAppointment.execute({ doctorId, ...body });

    if (result.isLeft()) {
      throw result.value;
    }

    return AppointmentPresenter.toHttp(result.value);
  }
}
