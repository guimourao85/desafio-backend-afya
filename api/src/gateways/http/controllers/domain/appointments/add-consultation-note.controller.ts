import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { AddConsultationNoteService } from '@/domains/domain/services/appointments/add-consultation-note.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';
import {
  ConsultationNoteHttpResponse,
  ConsultationNotePresenter,
} from '@/presentation/presenters/consultation-note.presenter';

import { AddConsultationNoteDto } from '../../../schemas/domain/appointment.schema';

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
  @ApiCreatedResponse({
    schema: {
      example: {
        id: '5b7e3c1a-2d9f-4e8b-a1c6-0f4d7b2e9a35',
        content: 'Paciente apresentou vermelhidão na pele do antebraço direito.',
        createdAt: '2026-08-10T11:30:00.000Z',
      },
    },
  })
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
