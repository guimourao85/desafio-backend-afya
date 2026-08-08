import { Doctor } from './doctor.entity';
import { RefreshToken } from './refresh-token.entity';

/**
 * A lista de entidades que os dois `DataSource` consomem.
 *
 * A **ordem importa**: é nela que o gerador emite os `CREATE TABLE`, e a FK
 * `refresh_tokens.doctor_id → doctors` acrescentada na revisão da migration
 * referenciaria uma tabela ainda inexistente se `doctors` não viesse primeiro.
 */
export default [Doctor, RefreshToken];

export { Doctor, RefreshToken };
