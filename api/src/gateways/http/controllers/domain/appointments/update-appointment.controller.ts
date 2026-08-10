import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { UpdateAppointmentService } from '@/domains/domain/services/appointments/update-appointment.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import {
  AppointmentHttpResponse,
  AppointmentPresenter,
} from '@/presentation/presenters/appointment.presenter';

import { ApiUnauthorizedErrorResponse } from '../../../decorators/api-unauthorized-error.decorator';
import { ApiValidationErrorResponse } from '../../../decorators/api-validation-error.decorator';
import { UpdateAppointmentDto } from '../../../schemas/domain/appointment.schema';

/**
 * `PATCH /api/appointments/:id` — reagendar e/ou concluir, na mesma requisição.
 *
 * Um endpoint só para as duas operações porque é isso que a tela faz: mover o
 * horário, marcar como atendida, ou as duas de uma vez.
 *
 * O paciente **não** muda aqui: trocá-lo reescreveria o histórico de atendimento
 * de duas pessoas. O caminho é cancelar e agendar de novo — mandar `patientId`
 * neste corpo responde 400.
 *
 * Recusas: 404 (consulta alheia ou inexistente) · 409 (o novo horário já está
 * ocupado) · 422 (já cancelada ou concluída, ou o paciente teve os dados pessoais
 * excluídos).
 *
 * Mais detalhes: PRODUCT.md — INV-01, INV-02, INV-04.
 */
@ApiTags('agendamentos')
@ApiBearerAuth()
@Controller('appointments')
export class UpdateAppointmentController {
  constructor(private readonly updateAppointment: UpdateAppointmentService) {}

  @Patch(':id')
  @ApiOperation({
    summary: 'Reagenda e/ou conclui uma consulta',
    description:
      'Só consulta **agendada** aceita mudança: cancelada e concluída são terminais e respondem 422. O paciente não muda — cancele e agende de novo. **Reagendar** exige paciente ativo: quem teve os dados excluídos (LGPD) responde 422. **Concluir** continua permitido, porque registrar o atendimento que aconteceu é preservar o histórico.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Identificador da **consulta**.' })
  // Três exemplos porque a rota faz três coisas, e o corpo é o que escolhe qual.
  @ApiBody({
    type: UpdateAppointmentDto,
    examples: {
      reagendar: {
        summary: 'Reagendar',
        value: { scheduledAt: '2027-06-02T09:00:00.000Z' },
      },
      concluir: {
        summary: 'Marcar como atendida',
        value: { status: 'COMPLETED' },
      },
      ambos: {
        summary: 'Reagendar e concluir na mesma requisição',
        value: { scheduledAt: '2027-06-02T09:00:00.000Z', status: 'COMPLETED' },
      },
    },
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
  // `patientId` no corpo cai aqui, e não em 404: o schema é `.strict()`, então
  // trocar o paciente da consulta é campo desconhecido — recusado na borda.
  @ApiValidationErrorResponse({
    details: [
      { path: 'status', message: 'O único status aceito é COMPLETED. Para cancelar, use DELETE.' },
    ],
  })
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
    description:
      'A consulta está cancelada ou concluída — ou o paciente teve os dados pessoais excluídos (LGPD) e não aceita reagendamento.',
    // `content`, e não `schema`: no OpenAPI 3 o `examples` é irmão do `schema`
    // dentro do media type. Aninhado sob `schema`, o documento até sai válido como
    // JSON e o Swagger UI **não mostra exemplo nenhum** — e o Swagger é a ferramenta
    // pela qual esta API é avaliada (PLAN.md §14.3).
    content: {
      'application/json': {
        examples: {
          estadoTerminal: {
            summary: 'Consulta em estado terminal',
            value: {
              statusCode: 422,
              code: 'BUSINESS_RULE_VIOLATION',
              message: 'Consulta cancelada ou concluída não pode ser reagendada.',
            },
          },
          pacienteAnonimizado: {
            summary: 'Paciente com dados excluídos (LGPD)',
            value: {
              statusCode: 422,
              code: 'BUSINESS_RULE_VIOLATION',
              message: 'Paciente anonimizado (LGPD) não pode ter consultas reagendadas.',
            },
          },
        },
      },
    },
  })
  async handle(
    @CurrentDoctor() doctorId: string,
    @Param('id', ParseUUIDPipe) appointmentId: string,
    @Body() body: UpdateAppointmentDto,
  ): Promise<AppointmentHttpResponse> {
    // O controller não decide se reagenda, se conclui ou se faz as duas: só repassa
    // o que veio. Quem sabe quais transições de estado existem é a consulta em si.
    const result = await this.updateAppointment.execute({ doctorId, appointmentId, ...body });

    if (result.isLeft()) {
      // `throw` entrega o erro ao filtro global, que traduz para status e mensagem.
      throw result.value;
    }

    return AppointmentPresenter.toHttp(result.value);
  }
}
