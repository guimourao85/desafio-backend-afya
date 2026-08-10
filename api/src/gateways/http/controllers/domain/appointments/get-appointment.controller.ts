import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { GetAppointmentService } from '@/domains/domain/services/appointments/get-appointment.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import {
  AppointmentHttpResponse,
  AppointmentPresenter,
} from '@/presentation/presenters/appointment.presenter';

import { ApiUnauthorizedErrorResponse } from '../../../decorators/api-unauthorized-error.decorator';
import { ApiValidationErrorResponse } from '../../../decorators/api-validation-error.decorator';

/**
 * `GET /api/appointments/:id` — abre uma consulta específica.
 *
 * A regra que vale a leitura: pedir a consulta de outro médico responde **404**,
 * exatamente igual a pedir uma que não existe. Não é descuido — responder 403
 * confirmaria que aquele ID existe, e isso já entrega a agenda do vizinho para
 * quem só tinha um palpite.
 *
 * Mais detalhes: PRODUCT.md — INV-04.
 */
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
  @ApiParam({ name: 'id', format: 'uuid', description: 'Identificador da **consulta**.' })
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
  @ApiValidationErrorResponse()
  @ApiUnauthorizedErrorResponse()
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
    // O médico sai do token, nunca da URL nem do corpo. É por isso que a rota não
    // tem onde mentir sobre de quem é a agenda.
    @CurrentDoctor() doctorId: string,
    // `ParseUUIDPipe`: um id malformado vira 400 aqui na borda. Sem ele o texto
    // solto chegaria ao Postgres e voltaria como 500 do driver.
    @Param('id', ParseUUIDPipe) appointmentId: string,
  ): Promise<AppointmentHttpResponse> {
    const result = await this.getAppointment.execute({ doctorId, appointmentId });

    if (result.isLeft()) {
      // `throw` entrega o erro ao filtro global, que traduz para status e mensagem.
      // O controller não escolhe status nem escreve texto de erro.
      throw result.value;
    }

    return AppointmentPresenter.toHttp(result.value);
  }
}
