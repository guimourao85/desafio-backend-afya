import { Module } from '@nestjs/common';

import { AnonymizePatientService } from './anonymize-patient.service';
import { FindPatientSummaryService } from './find-patient-summary.service';
import { GetPatientService } from './get-patient.service';
import { ListPatientsService } from './list-patients.service';
import { patientsProviders } from './patients.provider';
import { RegisterPatientService } from './register-patient.service';
import { UpdatePatientService } from './update-patient.service';

/**
 * O contexto de pacientes: cadastro, perfil e conformidade LGPD.
 *
 * Exporta os **services**, nunca `PATIENTS_REPOSITORY`. Em Nest a fronteira do
 * agregado é literalmente o `exports`: o token exportado daria a qualquer módulo a
 * tabela `patients` por baixo de toda regra desta pasta — inclusive do filtro por
 * médico. Quem precisa de paciente importa este módulo e injeta
 * `FindPatientSummaryService`.
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
