import { Patient } from '../model-entities/patient.entity';

export interface ListPatientsFilters {
  doctorId: string;
  /** Termo livre sobre o nome. Ausente = lista tudo do médico. */
  search?: string;
  page: number;
  perPage: number;
}

export interface PatientPage {
  items: Patient[];
  /** Total **do médico**, já filtrado — é o que alimenta `meta.totalPages`. */
  total: number;
}

/**
 * O contrato de acesso ao banco de pacientes — a lista do que o sistema sabe fazer
 * com a tabela, sem dizer como.
 *
 * **Todo** método recebe o médico dono, inclusive os de escrita. Não é redundância:
 * a regra "nenhum dado é lido ou escrito fora do consultório de quem está logado"
 * precisa de algo mais forte que boa vontade. Numa assinatura que aceitasse a
 * operação sem o dono, a regra viraria disciplina de quem escrever o próximo
 * service — e disciplina falha em silêncio. Aqui, esquecer **não compila**.
 *
 * `findByIdForDoctor` se chama assim, e não `findById`, porque o nome é a primeira
 * documentação de que a busca é filtrada.
 *
 * Mais detalhes: PRODUCT.md — INV-04.
 */
export interface PatientRepository {
  create(patient: Patient): Promise<Patient>;

  /** O `UPDATE` filtra por `(id, doctor_id)`: a linha alheia não muda nem por engano. */
  save(patient: Patient, doctorId: string): Promise<Patient>;

  findByIdForDoctor(id: string, doctorId: string): Promise<Patient | null>;

  list(filters: ListPatientsFilters): Promise<PatientPage>;
}
