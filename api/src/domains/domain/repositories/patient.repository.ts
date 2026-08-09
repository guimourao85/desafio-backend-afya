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
 * A porta de persistência do paciente.
 *
 * **Todo** método recebe `doctorId`, inclusive os de escrita. Não é redundância:
 * INV-04 diz que nenhum dado é lido ou escrito fora do escopo do médico do token, e
 * uma assinatura que aceita a operação sem o dono transforma essa invariante em
 * disciplina de quem escreve o próximo service. Aqui, esquecer não compila.
 *
 * `findByIdForDoctor` tem esse nome — e não `findById` — porque o nome é a primeira
 * documentação de que a busca é escopada.
 */
export interface PatientRepository {
  create(patient: Patient): Promise<Patient>;

  /** O `UPDATE` filtra por `(id, doctor_id)`: a linha alheia não muda nem por engano. */
  save(patient: Patient, doctorId: string): Promise<Patient>;

  findByIdForDoctor(id: string, doctorId: string): Promise<Patient | null>;

  list(filters: ListPatientsFilters): Promise<PatientPage>;
}
