import { Module } from '@nestjs/common';

import { AnonymizePatientService } from './anonymize-patient.service';
import { FindPatientSummaryService } from './find-patient-summary.service';
import { GetPatientService } from './get-patient.service';
import { ListPatientsService } from './list-patients.service';
import { patientsProviders } from './patients.provider';
import { RegisterPatientService } from './register-patient.service';
import { UpdatePatientService } from './update-patient.service';

/**
 * O contexto de pacientes: cadastro, ficha e conformidade com a LGPD.
 *
 * Exporta os **casos de uso**, nunca o acesso direto à tabela. No Nest, a fronteira
 * entre módulos é literalmente esta lista de `exports`: publicar o token do
 * repositório daria a qualquer outro módulo a tabela `patients` por baixo de toda
 * regra desta pasta — inclusive por baixo do filtro por médico.
 *
 * Quem precisa de paciente importa este módulo e usa `FindPatientSummaryService`.
 *
 * Mais detalhes: PRODUCT.md — §dominios.
 */
@Module({
  providers: [
    ...patientsProviders,
    RegisterPatientService,
    GetPatientService,
    ListPatientsService,
    UpdatePatientService,
    AnonymizePatientService,
    FindPatientSummaryService,
  ],
  exports: [
    RegisterPatientService,
    GetPatientService,
    ListPatientsService,
    UpdatePatientService,
    AnonymizePatientService,
    FindPatientSummaryService,
  ],
})
export class PatientsModule {}
