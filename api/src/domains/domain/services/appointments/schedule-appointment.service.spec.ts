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
import { AppointmentStatus } from '../../model-entities/appointment.entity';
import { FindPatientSummaryService } from '../patients/find-patient-summary.service';
import { ScheduleAppointmentService } from './schedule-appointment.service';

const SLOT = new Date('2026-08-12T14:00:00.000Z');

describe('ScheduleAppointmentService', () => {
  let service: ScheduleAppointmentService;
  let appointments: InMemoryAppointmentRepository;
  let patients: InMemoryPatientRepository;

  beforeEach(async () => {
    appointments = new InMemoryAppointmentRepository();
    patients = new InMemoryPatientRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ScheduleAppointmentService,
        // O service **real** do outro módulo, não um duplo dele: é assim que a
        // travessia acontece em produção, e é o que o teste precisa exercitar.
        FindPatientSummaryService,
        { provide: APPOINTMENTS_REPOSITORY, useValue: appointments },
        { provide: PATIENTS_REPOSITORY, useValue: patients },
      ],
    }).compile();

    service = moduleRef.get(ScheduleAppointmentService);
    patients.items.push(makePatient({ id: 'patient-1', doctorId: 'doctor-1' }));
  });

  it('agenda em horário livre', async () => {
    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'patient-1',
      scheduledAt: SLOT,
    });

    expect(result.isRight()).toBe(true);
    expect(appointments.items).toHaveLength(1);
    expect(appointments.items[0].status).toBe(AppointmentStatus.SCHEDULED);
  });

  // INV-01, primeira camada.
  it('recusa segundo agendamento do mesmo médico no mesmo instante', async () => {
    appointments.items.push(makeAppointment({ doctorId: 'doctor-1', scheduledAt: SLOT }));

    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'patient-1',
      scheduledAt: SLOT,
    });

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(ScheduleConflictError);
    expect(appointments.items).toHaveLength(1);
  });

  it('aceita o mesmo instante para **outro** médico — a agenda é por médico', async () => {
    appointments.items.push(makeAppointment({ doctorId: 'doctor-2', scheduledAt: SLOT }));

    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'patient-1',
      scheduledAt: SLOT,
    });

    expect(result.isRight()).toBe(true);
  });

  // O `WHERE` do índice parcial, em forma de comportamento.
  it('aceita o horário de uma consulta **cancelada**', async () => {
    appointments.items.push(
      makeAppointment({
        doctorId: 'doctor-1',
        scheduledAt: SLOT,
        status: AppointmentStatus.CANCELLED,
      }),
    );

    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'patient-1',
      scheduledAt: SLOT,
    });

    expect(result.isRight()).toBe(true);
  });

  it('recusa paciente inexistente com 404', async () => {
    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'nao-existe',
      scheduledAt: SLOT,
    });

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(ResourceNotFoundError);
  });

  // INV-04 chega de graça: quem filtra por médico é o service do outro módulo.
  it('recusa paciente de outro médico com 404, sem saber que INV-04 existe', async () => {
    patients.items.push(makePatient({ id: 'patient-2', doctorId: 'doctor-2' }));

    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'patient-2',
      scheduledAt: SLOT,
    });

    expect(result.value).toBeInstanceOf(ResourceNotFoundError);
  });

  // INV-02.
  it('recusa paciente anonimizado com 422', async () => {
    patients.items.push(
      makePatient({
        id: 'patient-3',
        doctorId: 'doctor-1',
        anonymizedAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    );

    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'patient-3',
      scheduledAt: SLOT,
    });

    expect(result.value).toBeInstanceOf(BusinessRuleViolationError);
    expect(appointments.items).toHaveLength(0);
  });
});
