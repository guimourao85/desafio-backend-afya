import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { GetAppointmentService } from '@/domains/domain/services/appointments/get-appointment.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import {
  AppointmentHttpResponse,
  AppointmentPresenter,
} from '@/presentation/presenters/appointment.presenter';

@ApiTags('agendamentos')
@ApiBearerAuth()
@Controller('appointments')
export class GetAppointmentController {
  constructor(private readonly getAppointment: GetAppointmentService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Consulta um agendamento',
    description: 'Agendamento de outro médico responde **404**, igual ao inexistente.',
  })
  @ApiOkResponse({
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
    schema: {
      example: {
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Agendamento não encontrado.',
      },
    },
  })
  async handle(
    @CurrentDoctor() doctorId: string,
    @Param('id', ParseUUIDPipe) appointmentId: string,
  ): Promise<AppointmentHttpResponse> {
    const result = await this.getAppointment.execute({ doctorId, appointmentId });

    if (result.isLeft()) {
      throw result.value;
    }

    return AppointmentPresenter.toHttp(result.value);
  }
}
