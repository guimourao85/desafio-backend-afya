import { Test } from '@nestjs/testing';

import { APPOINTMENTS_REPOSITORY, PATIENTS_REPOSITORY } from '@/shared/constants/repositories';
import { ResourceNotFoundError } from '@/shared/errors/types';

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
import { GetPatientTimelineService } from './get-patient-timeline.service';

const JANEIRO = new Date('2026-01-01T09:00:00.000Z');
const FEVEREIRO = new Date('2026-02-10T09:00:00.000Z');
const MAIO = new Date('2026-05-15T09:00:00.000Z');

describe('GetPatientTimelineService', () => {
  let service: GetPatientTimelineService;
  let appointments: InMemoryAppointmentRepository;
  let patients: InMemoryPatientRepository;

  beforeEach(async () => {
    appointments = new InMemoryAppointmentRepository();
    patients = new InMemoryPatientRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [
        GetPatientTimelineService,
        // O service **real** do `PatientsModule`, não um duplo: a travessia entre
        // módulos é o que este teste precisa exercitar.
        FindPatientSummaryService,
        { provide: APPOINTMENTS_REPOSITORY, useValue: appointments },
        { provide: PATIENTS_REPOSITORY, useValue: patients },
      ],
    }).compile();

    service = moduleRef.get(GetPatientTimelineService);
    patients.items.push(makePatient({ id: 'patient-1', doctorId: 'doctor-1' }));
  });

  it('devolve a história do mais recente para trás', async () => {
    appointments.items.push(
      makeAppointment({ patientId: 'patient-1', scheduledAt: JANEIRO }),
      makeAppointment({ patientId: 'patient-1', scheduledAt: MAIO }),
      makeAppointment({ patientId: 'patient-1', scheduledAt: FEVEREIRO }),
    );

    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'patient-1',
      page: 1,
      perPage: 20,
    });

    expect(result.isRight()).toBe(true);
    const { items } = result.value as { items: { scheduledAt: Date }[] };
    // O oposto da agenda, que se lê do próximo para o fim.
    expect(items.map((item) => item.scheduledAt)).toEqual([MAIO, FEVEREIRO, JANEIRO]);
  });

  it('inclui consultas canceladas, com o status', async () => {
    appointments.items.push(
      makeAppointment({ patientId: 'patient-1', status: AppointmentStatus.CANCELLED }),
      makeAppointment({ patientId: 'patient-1', status: AppointmentStatus.COMPLETED }),
    );

    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'patient-1',
      page: 1,
      perPage: 20,
    });

    // Histórico é registro contábil: esconder a cancelada seria reescrevê-lo.
    expect((result.value as { total: number }).total).toBe(2);
  });

  it('traz as anotações de cada consulta, na ordem em que foram escritas', async () => {
    const appointment = makeAppointment({ patientId: 'patient-1' });
    appointment.addNote('primeira');
    appointment.addNote('segunda');
    await appointments.appendNotes(appointment);
    appointments.items.push(appointment);

    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'patient-1',
      page: 1,
      perPage: 20,
    });

    const { items } = result.value as { items: { notes?: { content: string }[] }[] };
    expect(items[0].notes?.map((note) => note.content)).toEqual(['primeira', 'segunda']);
  });

  it('consulta sem anotação vem com lista vazia, nunca ausente', async () => {
    const appointment = makeAppointment({ patientId: 'patient-1' });
    appointment.notes = [];
    appointments.items.push(appointment);

    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'patient-1',
      page: 1,
      perPage: 20,
    });

    const { items } = result.value as { items: { notes?: unknown[] }[] };
    expect(items[0].notes).toEqual([]);
  });

  // INV-04 em duas camadas: o paciente é conferido antes, e a agenda é filtrada
  // por médico depois. Falhar em qualquer uma vazaria a base de outro consultório.
  it('paciente de outro médico responde igual a paciente inexistente', async () => {
    patients.items.push(makePatient({ id: 'patient-2', doctorId: 'doctor-2' }));

    const doOutro = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'patient-2',
      page: 1,
      perPage: 20,
    });
    const inexistente = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'nao-existe',
      page: 1,
      perPage: 20,
    });

    expect(doOutro.value).toBeInstanceOf(ResourceNotFoundError);
    expect((doOutro.value as Error).message).toBe((inexistente.value as Error).message);
  });

  it('não mistura consultas de outro paciente do mesmo médico', async () => {
    patients.items.push(makePatient({ id: 'patient-9', doctorId: 'doctor-1' }));
    appointments.items.push(
      makeAppointment({ patientId: 'patient-1' }),
      makeAppointment({ patientId: 'patient-9' }),
    );

    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'patient-1',
      page: 1,
      perPage: 20,
    });

    expect((result.value as { total: number }).total).toBe(1);
  });

  // Paciente existe, história ainda não começou. 404 aqui diria que o recurso não
  // existe, que é falso — e o cliente não teria como distinguir dos casos acima.
  it('paciente sem nenhuma consulta devolve página vazia, não 404', async () => {
    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'patient-1',
      page: 1,
      perPage: 20,
    });

    expect(result.isRight()).toBe(true);
    expect(result.value).toEqual({ items: [], total: 0 });
  });

  it('página além do fim devolve lista vazia com o total real', async () => {
    appointments.items.push(makeAppointment({ patientId: 'patient-1' }));

    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'patient-1',
      page: 2,
      perPage: 20,
    });

    expect(result.value).toEqual({ items: [], total: 1 });
  });

  // INV-03: o esquecimento apaga a identidade, não o atendimento.
  it('paciente anonimizado mantém a história inteira', async () => {
    const patient = patients.items[0];
    patient.anonymize(new Date('2026-08-10T12:00:00.000Z'));
    appointments.items.push(makeAppointment({ patientId: 'patient-1' }));

    const result = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'patient-1',
      page: 1,
      perPage: 20,
    });

    expect(result.isRight()).toBe(true);
    expect((result.value as { total: number }).total).toBe(1);
  });
});
