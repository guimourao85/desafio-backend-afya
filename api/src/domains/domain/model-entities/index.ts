import { Appointment } from './appointment.entity';
import { ConsultationNote } from './consultation-note.entity';
import { Doctor } from './doctor.entity';
import { Patient } from './patient.entity';
import { RefreshToken } from './refresh-token.entity';

/**
 * A lista de entidades que os dois `DataSource` consomem.
 *
 * A **ordem importa**: é nela que o gerador emite os `CREATE TABLE`, e as FKs
 * acrescentadas à mão na revisão referenciariam tabela inexistente se a referida
 * viesse depois. `appointments` aponta para `doctors` **e** `patients`;
 * `consultation_notes` vem por último porque aponta para `appointments`.
 */
export default [Doctor, RefreshToken, Patient, Appointment, ConsultationNote];

export { Appointment, ConsultationNote, Doctor, Patient, RefreshToken };
