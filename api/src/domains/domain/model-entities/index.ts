import { Appointment } from './appointment.entity';
import { Doctor } from './doctor.entity';
import { Patient } from './patient.entity';
import { RefreshToken } from './refresh-token.entity';

/**
 * A lista de entidades que os dois `DataSource` consomem.
 *
 * A **ordem importa**: é nela que o gerador emite os `CREATE TABLE`, e as FKs
 * acrescentadas à mão na revisão referenciariam tabela inexistente se a referida
 * viesse depois. `appointments` é a última porque aponta para `doctors` **e**
 * `patients`.
 */
export default [Doctor, RefreshToken, Patient, Appointment];

export { Appointment, Doctor, Patient, RefreshToken };
