import { Controller, Delete, HttpCode, HttpStatus, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { CancelAppointmentService } from '@/domains/domain/services/appointments/cancel-appointment.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';

@ApiTags('agendamentos')
@ApiBearerAuth()
@Controller('appointments')
export class CancelAppointmentController {
  constructor(private readonly cancelAppointment: CancelAppointmentService) {}

  // `DELETE` que cancela, não apaga: o verbo é o que o cliente espera para
  // "excluir", e o efeito preserva a trilha de atendimento (PRODUCT.md §regras).
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancela a consulta, liberando o horário',
    description:
      'A linha permanece com status CANCELLED, e o horário volta a aceitar agendamento. Cancelar de novo responde 204; cancelar consulta **concluída** responde 422.',
  })
  @ApiNoContentResponse({ description: 'Cancelada — ou já estava.' })
  @ApiNotFoundResponse({
    schema: {
      example: {
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Agendamento não encontrado.',
      },
    },
  })
  @ApiUnprocessableEntityResponse({
    description: 'A consulta já foi concluída.',
    schema: {
      example: {
        statusCode: 422,
        code: 'BUSINESS_RULE_VIOLATION',
        message: 'Consulta já concluída não pode ser cancelada.',
      },
    },
  })
  async handle(
    @CurrentDoctor() doctorId: string,
    @Param('id', ParseUUIDPipe) appointmentId: string,
  ): Promise<void> {
    const result = await this.cancelAppointment.execute({ doctorId, appointmentId });

    if (result.isLeft()) {
      throw result.value;
    }
  }
}
