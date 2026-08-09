import { Doctor } from './doctor.entity';
import { Patient } from './patient.entity';
import { RefreshToken } from './refresh-token.entity';

/**
 * A lista de entidades que os dois `DataSource` consomem.
 *
 * A **ordem importa**: é nela que o gerador emite os `CREATE TABLE`, e as FKs
 * acrescentadas na revisão da migration (`refresh_tokens.doctor_id → doctors`,
 * `patients.doctor_id → doctors`) referenciariam uma tabela ainda inexistente se
 * `doctors` não viesse primeiro.
 */
export default [Doctor, RefreshToken, Patient];

export { Doctor, Patient, RefreshToken };
