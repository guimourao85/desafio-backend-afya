import { Controller, Delete, HttpCode, HttpStatus, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AnonymizePatientService } from '@/domains/domain/services/patients/anonymize-patient.service';
import { CurrentDoctor } from '@/framework/authentication/current-doctor.decorator';

/**
 * `DELETE /api/patients/:id` — o "excluir paciente" da tela, que na verdade
 * anonimiza. É a rota do direito ao esquecimento (LGPD).
 *
 * Some o que identifica: nome, telefone, email e nascimento. Fica o que não
 * identifica ninguém sozinho e ainda tem valor clínico — sexo, altura, peso — e
 * **toda a agenda do paciente**, intacta. Parece contraditório apagar dado pessoal
 * e guardar histórico, mas é o pedido certo: a lei quer que a pessoa deixe de ser
 * identificável, não que os atendimentos deixem de ter acontecido.
 *
 * Idempotente: anonimizar de novo responde 204 e **não** reescreve a data de
 * quando o direito foi exercido — isso é dado de conformidade.
 *
 * Mais detalhes: PRODUCT.md — INV-03.
 */
@ApiTags('pacientes')
@ApiBearerAuth()
@Controller('patients')
export class AnonymizePatientController {
  constructor(private readonly anonymizePatient: AnonymizePatientService) {}

  // `DELETE` que **não** apaga: o verbo é o que o cliente espera para "excluir", e o
  // efeito é anonimizar (PRODUCT.md §regras). Apagar a linha destruiria a trilha de
  // atendimento — o oposto do que a LGPD pede aqui.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Anonimiza o paciente (LGPD) preservando o histórico',
    description:
      'Apaga nome, telefone, email e nascimento. Sexo, medidas e **toda a agenda** permanecem. Idempotente: anonimizar de novo responde 204 e não reescreve a data.',
  })
  @ApiNoContentResponse({ description: 'Anonimizado — ou já estava.' })
  @ApiNotFoundResponse({
    schema: {
      example: {
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Paciente não encontrado.',
      },
    },
  })
  async handle(
    @CurrentDoctor() doctorId: string,
    @Param('id', ParseUUIDPipe) patientId: string,
  ): Promise<void> {
    const result = await this.anonymizePatient.execute({ doctorId, patientId });

    if (result.isLeft()) {
      throw result.value;
    }
  }
}
