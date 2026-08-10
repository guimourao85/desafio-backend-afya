import { Test } from '@nestjs/testing';

import { APPOINTMENTS_REPOSITORY, PATIENTS_REPOSITORY } from '@/shared/constants/repositories';
import {
  BusinessRuleViolationError,
  ResourceNotFoundError,
  ScheduleConflictError,
} from '@/shared/errors/types';

import {
  InMemoryAppointmentRepository,
  makeAppointment,
} from '../../../../../test/factories/in-memory-appointment.repository';
import {
  InMemoryPatientRepository,
  makePatient,
} from '../../../../../test/factories/in-memory-patient.repository';
import { Appointment, AppointmentStatus } from '../../model-entities/appointment.entity';
import { FindPatientSummaryService } from '../patients/find-patient-summary.service';
import { UpdateAppointmentService } from './update-appointment.service';

const SLOT = new Date('2026-08-12T14:00:00.000Z');
const OUTRO_SLOT = new Date('2026-08-13T09:00:00.000Z');

describe('UpdateAppointmentService', () => {
  let service: UpdateAppointmentService;
  let repository: InMemoryAppointmentRepository;
  let patients: InMemoryPatientRepository;

  beforeEach(async () => {
    repository = new InMemoryAppointmentRepository();
    patients = new InMemoryPatientRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [
        UpdateAppointmentService,
        // O service **real** do outro módulo, não um duplo dele: é assim que a
        // travessia acontece em produção.
        FindPatientSummaryService,
        { provide: APPOINTMENTS_REPOSITORY, useValue: repository },
        { provide: PATIENTS_REPOSITORY, useValue: patients },
      ],
    }).compile();

    service = moduleRef.get(UpdateAppointmentService);
    patients.items.push(makePatient({ id: 'patient-1', doctorId: 'doctor-1' }));
  });

  it('reagenda para horário livre', async () => {
    const appointment = makeAppointment({ scheduledAt: SLOT });
    repository.items.push(appointment);

    const result = await service.execute({
      doctorId: 'doctor-1',
      appointmentId: appointment.id,
      scheduledAt: OUTRO_SLOT,
    });

    expect(result.isRight()).toBe(true);
    expect((result.value as Appointment).scheduledAt).toBe(OUTRO_SLOT);
  });

  it('recusa reagendamento para horário ocupado', async () => {
    const appointment = makeAppointment({ scheduledAt: SLOT });
    repository.items.push(appointment, makeAppointment({ scheduledAt: OUTRO_SLOT }));

    const result = await service.execute({
      doctorId: 'doctor-1',
      appointmentId: appointment.id,
      scheduledAt: OUTRO_SLOT,
    });

    expect(result.value).toBeInstanceOf(ScheduleConflictError);
    // A recusa não deixou rastro: o conflito é verificado antes de mexer no estado.
    expect(appointment.scheduledAt).toBe(SLOT);
  });

  // Sem `ignoreId`, a consulta encontraria a si mesma e a requisição mais
  // inofensiva possível viraria 409.
  it('aceita reagendar para o **próprio** horário atual', async () => {
    const appointment = makeAppointment({ scheduledAt: SLOT });
    repository.items.push(appointment);

    const result = await service.execute({
      doctorId: 'doctor-1',
      appointmentId: appointment.id,
      scheduledAt: SLOT,
    });

    expect(result.isRight()).toBe(true);
  });

  it('conclui a consulta', async () => {
    const appointment = makeAppointment();
    repository.items.push(appointment);

    const result = await service.execute({
      doctorId: 'doctor-1',
      appointmentId: appointment.id,
      status: AppointmentStatus.COMPLETED,
    });

    expect((result.value as Appointment).status).toBe(AppointmentStatus.COMPLETED);
  });

  it('reagenda e conclui na mesma requisição', async () => {
    const appointment = makeAppointment({ scheduledAt: SLOT });
    repository.items.push(appointment);

    const result = await service.execute({
      doctorId: 'doctor-1',
      appointmentId: appointment.id,
      scheduledAt: OUTRO_SLOT,
      status: AppointmentStatus.COMPLETED,
    });

    expect((result.value as Appointment).scheduledAt).toBe(OUTRO_SLOT);
    expect((result.value as Appointment).status).toBe(AppointmentStatus.COMPLETED);
  });

  it.each([
    ['cancelada', AppointmentStatus.CANCELLED],
    ['concluída', AppointmentStatus.COMPLETED],
  ])('recusa reagendar consulta %s com 422', async (_caso, status) => {
    const appointment = makeAppointment({ status });
    repository.items.push(appointment);

    const result = await service.execute({
      doctorId: 'doctor-1',
      appointmentId: appointment.id,
      scheduledAt: OUTRO_SLOT,
    });

    expect(result.value).toBeInstanceOf(BusinessRuleViolationError);
  });

  it('recusa agendamento de outro médico com 404, e não o altera', async () => {
    const alheio = makeAppointment({ doctorId: 'doctor-2', scheduledAt: SLOT });
    repository.items.push(alheio);

    const result = await service.execute({
      doctorId: 'doctor-1',
      appointmentId: alheio.id,
      scheduledAt: OUTRO_SLOT,
    });

    expect(result.value).toBeInstanceOf(ResourceNotFoundError);
    expect(alheio.scheduledAt).toBe(SLOT);
  });

  /**
   * INV-02, a terceira operação da lista. As outras duas — editar o paciente e
   * agendar — já eram cobradas desde F3 e F4; esta ficou sem enforcement até a
   * sprint 04.02, e o documento descrevia uma regra que o código não cumpria.
   */
  describe('paciente com dados pessoais excluídos (LGPD)', () => {
    beforeEach(() => {
      patients.items[0].anonymize(new Date('2026-08-01T00:00:00.000Z'));
    });

    it('recusa reagendamento com 422, e não move a consulta', async () => {
      const appointment = makeAppointment({ patientId: 'patient-1', scheduledAt: SLOT });
      repository.items.push(appointment);

      const result = await service.execute({
        doctorId: 'doctor-1',
        appointmentId: appointment.id,
        scheduledAt: OUTRO_SLOT,
      });

      expect(result.value).toBeInstanceOf(BusinessRuleViolationError);
      expect((result.value as Error).message).toBe(
        'Paciente anonimizado (LGPD) não pode ter consultas reagendadas.',
      );
      expect(appointment.scheduledAt).toBe(SLOT);
    });

    /**
     * O outro lado da regra, e o que a mantém coerente com o enunciado: excluir os
     * dados pessoais preserva o histórico de consulta. Concluir uma consulta que já
     * aconteceu é **registrar** esse histórico, não criar compromisso novo.
     */
    it('permite concluir a consulta', async () => {
      const appointment = makeAppointment({ patientId: 'patient-1' });
      repository.items.push(appointment);

      const result = await service.execute({
        doctorId: 'doctor-1',
        appointmentId: appointment.id,
        status: AppointmentStatus.COMPLETED,
      });

      expect(result.isRight()).toBe(true);
      expect(appointment.status).toBe(AppointmentStatus.COMPLETED);
    });

    // A recusa vem antes da checagem de horário: mandar 409 aqui faria o cliente
    // procurar outro horário para um pedido que nenhum horário resolve.
    it('recusa com 422, e não 409, mesmo quando o novo horário está ocupado', async () => {
      const appointment = makeAppointment({ patientId: 'patient-1', scheduledAt: SLOT });
      repository.items.push(appointment, makeAppointment({ scheduledAt: OUTRO_SLOT }));

      const result = await service.execute({
        doctorId: 'doctor-1',
        appointmentId: appointment.id,
        scheduledAt: OUTRO_SLOT,
      });

      expect(result.value).toBeInstanceOf(BusinessRuleViolationError);
      expect(result.value).not.toBeInstanceOf(ScheduleConflictError);
    });
  });
});
