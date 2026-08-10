import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { AddConsultationNoteService } from '@/domains/domain/services/appointments/add-consultation-note.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import {
  ConsultationNoteHttpResponse,
  ConsultationNotePresenter,
} from '@/presentation/presenters/consultation-note.presenter';

import { ApiUnauthorizedErrorResponse } from '../../../decorators/api-unauthorized-error.decorator';
import { ApiValidationErrorResponse } from '../../../decorators/api-validation-error.decorator';
import { AddConsultationNoteDto } from '../../../schemas/domain/appointment.schema';

/**
 * `POST /api/appointments/:id/notes` — registra uma anotação do atendimento.
 *
 * A anotação nasce **pela consulta**, nunca solta: quem valida o estado é a própria
 * `Appointment.addNote()`, e por isso a rota carrega o id da consulta na URL.
 * Concluída aceita — anota-se depois de atender; só a cancelada recusa, com 422,
 * porque o atendimento que a nota descreveria não aconteceu (INV-05).
 *
 * Imutável de propósito: não existe rota para editar nem apagar uma anotação —
 * prontuário que se reescreve sem trilha é pior que prontuário que não se edita.
 *
 * Consulta de outro médico responde 404, indistinguível de inexistente (INV-04).
 *
 * Mais detalhes: PRODUCT.md — INV-04, INV-05.
 */
@ApiTags('agendamentos')
@ApiBearerAuth()
@Controller('appointments')
export class AddConsultationNoteController {
  constructor(private readonly addConsultationNote: AddConsultationNoteService) {}

  @Post(':id/notes')
  @ApiOperation({
    summary: 'Registra uma anotação do atendimento',
    description:
      'A anotação é **imutável**: não há rota para editar nem apagar — prontuário que se reescreve sem trilha é pior que prontuário que não se edita. Consulta **concluída aceita** anotação (anota-se depois de atender); só a **cancelada** recusa, com **422**.',
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'Identificador da **consulta** que recebe a anotação.',
  })
  @ApiBody({
    type: AddConsultationNoteDto,
    examples: {
      atendimento: {
        summary: 'Anotação de atendimento',
        value: {
          content:
            'Paciente relatou dor lombar há três dias, sem irradiação. Orientado repouso relativo e retorno em uma semana se persistir.',
        },
      },
    },
  })
  @ApiCreatedResponse({
    schema: {
      example: {
        id: '5b7e3c1a-2d9f-4e8b-a1c6-0f4d7b2e9a35',
        content: 'Paciente apresentou vermelhidão na pele do antebraço direito.',
        createdAt: '2026-08-10T11:30:00.000Z',
      },
    },
  })
  // Anotação só de espaços cai aqui, não no banco: o `.trim()` do schema roda antes
  // do `.min(1)`, e o 400 diz qual campo estava vazio.
  @ApiValidationErrorResponse({
    details: [{ path: 'content', message: 'A anotação é obrigatória.' }],
  })
  @ApiUnauthorizedErrorResponse()
  @ApiNotFoundResponse({
    description: 'Agendamento inexistente — ou de outro médico.',
    schema: {
      example: {
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Agendamento não encontrado.',
      },
    },
  })
  @ApiUnprocessableEntityResponse({
    description: 'A consulta está cancelada.',
    schema: {
      example: {
        statusCode: 422,
        code: 'BUSINESS_RULE_VIOLATION',
        message: 'Consulta cancelada não aceita anotações.',
      },
    },
  })
  async handle(
    @CurrentDoctor() doctorId: string,
    @Param('id', ParseUUIDPipe) appointmentId: string,
    @Body() body: AddConsultationNoteDto,
  ): Promise<ConsultationNoteHttpResponse> {
    const result = await this.addConsultationNote.execute({ doctorId, appointmentId, ...body });

    if (result.isLeft()) {
      throw result.value;
    }

    return ConsultationNotePresenter.toHttp(result.value);
  }
}
