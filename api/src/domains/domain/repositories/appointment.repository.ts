import { Appointment, AppointmentStatus } from '../model-entities/appointment.entity';

export interface AppointmentFilters {
  doctorId: string;
  /** Instante inicial, inclusivo. */
  from?: Date;
  /** Instante final, inclusivo. */
  to?: Date;
  patientId?: string;
  status?: AppointmentStatus;
  page: number;
  perPage: number;
}

export interface AppointmentPage {
  items: Appointment[];
  total: number;
}

/**
 * O filtro da linha do tempo (RF-06).
 *
 * `doctorId` é **obrigatório**, e não opcional como em `AppointmentFilters`: a nota
 * não tem coluna `doctor_id` própria (por decisão — uma denormalização aqui poderia
 * divergir da raiz), então o único lugar onde INV-04 pode ser enforçada nesta
 * leitura é o filtro da **raiz**. Deixá-lo opcional abriria a porta para uma chamada
 * que devolve a agenda de outro consultório com as anotações junto.
 */
export interface PatientTimelineFilters {
  doctorId: string;
  patientId: string;
  page: number;
  perPage: number;
}

/**
 * A porta de persistência da agenda. `doctorId` em **todo** método que recebe um
 * identificador cru — a agenda de um médico não é alcançável a partir do token de
 * outro. A única exceção é `saveWithNotes`, e ela é explicada lá: o argumento já é
 * a raiz escopada, então o escopo viaja no objeto em vez de num parâmetro.
 */
export interface AppointmentRepository {
  create(appointment: Appointment): Promise<Appointment>;

  save(appointment: Appointment, doctorId: string): Promise<Appointment>;

  /**
   * Grava as anotações **novas** da raiz — as que `addNote()` acrescentou e que
   * ainda não têm identidade. Operação atômica do agregado, transação no adapter
   * (ADR-04).
   *
   * Nome estreito de propósito. A versão larga — `save(raiz)` deixando o
   * `cascade` do TypeORM cuidar das filhas — foi tentada e **quebra**: ao salvar uma
   * raiz cuja coleção `@OneToMany` está carregada, o TypeORM trata a lista como o
   * estado completo e desassocia (`SET NULL`) o que não estiver nela. Com uma raiz
   * lida sem `relations`, isso significa apagar a referência das anotações já
   * gravadas — `null value in column "appointment_id" violates not-null constraint`,
   * verificado no e2e. O `NOT NULL` foi a rede; sem ele o dano seria silencioso
   * (sprint 04.02, decisão 18).
   *
   * **Sem `doctorId`, e isso é deliberado.** Os outros métodos o exigem porque
   * recebem um `id` cru, que qualquer string satisfaz; aqui o argumento **é a raiz
   * já escopada** — só se obtém uma por `findByIdForDoctor`, `findByIdWithNotes` ou
   * `create`. O escopo viaja no objeto, e um parâmetro repetindo
   * `appointment.doctorId` seria proteção decorativa (decisão 17).
   */
  appendNotes(appointment: Appointment): Promise<Appointment>;

  /**
   * A raiz **sem** as anotações — a leitura de quem vai mudar o estado da consulta
   * ou acrescentar uma nota.
   *
   * Anotar não precisa das anteriores: `addNote` funciona com a lista indefinida, e
   * o `cascade` é `['insert']`, então o que não está carregado não é apagado.
   * Carregá-las aqui faria um `PATCH` de reagendamento puxar o prontuário inteiro
   * para reescrever uma coluna.
   */
  findByIdForDoctor(id: string, doctorId: string): Promise<Appointment | null>;

  /**
   * A raiz **com** as anotações, da mais antiga para a mais nova — a leitura do
   * detalhe da consulta.
   *
   * Método separado, e não um parâmetro booleano em `findByIdForDoctor`: quem chama
   * declara o que precisa, e o custo do `JOIN` fica visível no nome.
   */
  findByIdWithNotes(id: string, doctorId: string): Promise<Appointment | null>;

  /**
   * INV-01, primeira camada: a consulta **viva** do médico exatamente neste
   * instante, se existir.
   *
   * `ignoreId` existe para o reagendamento: sem ele, mover uma consulta para o
   * horário em que ela já está encontraria a si mesma e responderia 409 — a
   * requisição mais inofensiva possível virando conflito.
   */
  findActiveBySlot(
    doctorId: string,
    scheduledAt: Date,
    ignoreId?: string,
  ): Promise<Appointment | null>;

  list(filters: AppointmentFilters): Promise<AppointmentPage>;

  /**
   * A linha do tempo do paciente (RF-06): consultas do mais recente para trás, cada
   * uma já com suas anotações.
   *
   * Contrato de performance, não só de dados: **uma leitura**, nunca uma por
   * consulta. É a primeira rota do projeto onde um N+1 é possível.
   */
  listByPatientWithNotes(filters: PatientTimelineFilters): Promise<AppointmentPage>;
}
