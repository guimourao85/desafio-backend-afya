import { Controller, Delete, HttpCode, HttpStatus, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { CancelAppointmentService } from '@/domains/domain/services/appointments/cancel-appointment.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';

import { ApiUnauthorizedErrorResponse } from '../../../decorators/api-unauthorized-error.decorator';
import { ApiValidationErrorResponse } from '../../../decorators/api-validation-error.decorator';

/**
 * `DELETE /api/appointments/:id` — o "excluir" da tela, que na verdade cancela.
 *
 * A linha nunca sai do banco: o status vira `CANCELLED` e o horário volta a
 * aceitar agendamento. Apagar de verdade destruiria a trilha de atendimento, que
 * é justamente o que um prontuário existe para guardar.
 *
 * Cancelar de novo responde 204 sem reclamar — repetição de rede não é erro, e a
 * segunda chamada não destrói nada. Cancelar uma consulta **concluída** responde
 * 422: apagaria o registro de que o atendimento aconteceu.
 *
 * Mais detalhes: PRODUCT.md — §regras.
 */
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
  @ApiParam({ name: 'id', format: 'uuid', description: 'Identificador da **consulta**.' })
  @ApiNoContentResponse({ description: 'Cancelada — ou já estava.' })
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

    // Só há um erro possível aqui: a consulta já foi concluída. "Já cancelada" não
    // cai neste ramo de propósito — ela sai como sucesso, e a resposta é o mesmo 204.
    if (result.isLeft()) {
      throw result.value;
    }
  }
}
