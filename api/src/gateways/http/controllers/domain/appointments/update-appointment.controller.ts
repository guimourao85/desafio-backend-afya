import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { UpdateAppointmentService } from '@/domains/domain/services/appointments/update-appointment.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import {
  AppointmentHttpResponse,
  AppointmentPresenter,
} from '@/presentation/presenters/appointment.presenter';

import { UpdateAppointmentDto } from '../../../schemas/domain/appointment.schema';

@ApiTags('agendamentos')
@ApiBearerAuth()
@Controller('appointments')
export class UpdateAppointmentController {
  constructor(private readonly updateAppointment: UpdateAppointmentService) {}

  @Patch(':id')
  @ApiOperation({
    summary: 'Reagenda e/ou conclui uma consulta',
    description:
      'Só consulta **agendada** aceita mudança: cancelada e concluída são terminais e respondem 422. O paciente não muda — cancele e agende de novo.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        id: '9c1f8b2e-6a4d-4f1a-9c3b-7e2d5a0b1c9f',
        patientId: '3f1c8b2e-6a4d-4f1a-9c3b-7e2d5a0b1c9f',
        scheduledAt: '2026-08-13T09:00:00.000Z',
        status: 'COMPLETED',
        createdAt: '2026-08-09T18:00:00.000Z',
      },
    },
  })
  @ApiNotFoundResponse({
    schema: {
      example: {
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Agendamento não encontrado.',
      },
    },
  })
  @ApiConflictResponse({
    description: 'O novo horário já está ocupado por outra consulta não cancelada.',
    schema: {
      example: {
        statusCode: 409,
        code: 'SCHEDULE_CONFLICT',
        message: 'Já existe um agendamento neste horário.',
      },
    },
  })
  @ApiUnprocessableEntityResponse({
    description: 'A consulta está cancelada ou concluída.',
    schema: {
      example: {
        statusCode: 422,
        code: 'BUSINESS_RULE_VIOLATION',
        message: 'Consulta cancelada ou concluída não pode ser reagendada.',
      },
    },
  })
  async handle(
    @CurrentDoctor() doctorId: string,
    @Param('id', ParseUUIDPipe) appointmentId: string,
    @Body() body: UpdateAppointmentDto,
  ): Promise<AppointmentHttpResponse> {
    const result = await this.updateAppointment.execute({ doctorId, appointmentId, ...body });

    if (result.isLeft()) {
      throw result.value;
    }

    return AppointmentPresenter.toHttp(result.value);
  }
}
