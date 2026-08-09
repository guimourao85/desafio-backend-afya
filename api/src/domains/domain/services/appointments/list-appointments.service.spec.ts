import { Test } from '@nestjs/testing';

import { APPOINTMENTS_REPOSITORY } from '@/shared/constants/repositories';

import {
  InMemoryAppointmentRepository,
  makeAppointment,
} from '../../../../../test/factories/in-memory-appointment.repository';
import { AppointmentStatus } from '../../model-entities/appointment.entity';
import { GetAppointmentService } from './get-appointment.service';
import { ListAppointmentsService } from './list-appointments.service';

const DIA_12 = new Date('2026-08-12T14:00:00.000Z');
const DIA_13 = new Date('2026-08-13T09:00:00.000Z');
const DIA_20 = new Date('2026-08-20T09:00:00.000Z');

describe('ListAppointmentsService', () => {
  let service: ListAppointmentsService;
  let getAppointment: GetAppointmentService;
  let repository: InMemoryAppointmentRepository;

  beforeEach(async () => {
    repository = new InMemoryAppointmentRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ListAppointmentsService,
        GetAppointmentService,
        { provide: APPOINTMENTS_REPOSITORY, useValue: repository },
      ],
    }).compile();

    service = moduleRef.get(ListAppointmentsService);
    getAppointment = moduleRef.get(GetAppointmentService);
  });

  // INV-04 na listagem: o vazamento aqui não seria um recurso, seria a agenda inteira.
  it('lista só a agenda do médico autenticado', async () => {
    repository.items.push(
      makeAppointment({ doctorId: 'doctor-1', scheduledAt: DIA_12 }),
      makeAppointment({ doctorId: 'doctor-2', scheduledAt: DIA_13 }),
    );

    const { items, total } = await service.execute({ doctorId: 'doctor-1', page: 1, perPage: 20 });

    expect(items).toHaveLength(1);
    expect(total).toBe(1);
  });

  it('filtra por período, inclusivo nas duas pontas', async () => {
    repository.items.push(
      makeAppointment({ scheduledAt: DIA_12 }),
      makeAppointment({ scheduledAt: DIA_13 }),
      makeAppointment({ scheduledAt: DIA_20 }),
    );

    const { items } = await service.execute({
      doctorId: 'doctor-1',
      from: DIA_12,
      to: DIA_13,
      page: 1,
      perPage: 20,
    });

    expect(items).toHaveLength(2);
  });

  it('filtra por paciente e por status, combinados', async () => {
    repository.items.push(
      makeAppointment({ patientId: 'patient-1', status: AppointmentStatus.SCHEDULED }),
      makeAppointment({ patientId: 'patient-1', status: AppointmentStatus.CANCELLED }),
      makeAppointment({ patientId: 'patient-2', status: AppointmentStatus.SCHEDULED }),
    );

    const { items } = await service.execute({
      doctorId: 'doctor-1',
      patientId: 'patient-1',
      status: AppointmentStatus.SCHEDULED,
      page: 1,
      perPage: 20,
    });

    expect(items).toHaveLength(1);
  });

  it('ordena da próxima consulta para o fim', async () => {
    repository.items.push(
      makeAppointment({ scheduledAt: DIA_20 }),
      makeAppointment({ scheduledAt: DIA_12 }),
    );

    const { items } = await service.execute({ doctorId: 'doctor-1', page: 1, perPage: 20 });

    expect(items.map((a) => a.scheduledAt)).toEqual([DIA_12, DIA_20]);
  });

  it('agenda vazia devolve lista vazia, não erro', async () => {
    const { items, total } = await service.execute({ doctorId: 'doctor-1', page: 1, perPage: 20 });

    expect(items).toEqual([]);
    expect(total).toBe(0);
  });

  describe('GetAppointmentService', () => {
    it('devolve o agendamento do próprio médico', async () => {
      const appointment = makeAppointment();
      repository.items.push(appointment);

      const result = await getAppointment.execute({
        doctorId: 'doctor-1',
        appointmentId: appointment.id,
      });

      expect(result.isRight()).toBe(true);
    });

    it('responde igual para agendamento alheio e inexistente', async () => {
      const alheio = makeAppointment({ doctorId: 'doctor-2' });
      repository.items.push(alheio);

      const doOutro = await getAppointment.execute({
        doctorId: 'doctor-1',
        appointmentId: alheio.id,
      });
      const inexistente = await getAppointment.execute({
        doctorId: 'doctor-1',
        appointmentId: 'nao-existe',
      });

      expect(doOutro.isLeft()).toBe(true);
      expect((doOutro.value as Error).message).toBe((inexistente.value as Error).message);
    });
  });
});
