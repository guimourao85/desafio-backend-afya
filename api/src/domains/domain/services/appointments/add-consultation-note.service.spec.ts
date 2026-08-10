import { Test } from '@nestjs/testing';

import { APPOINTMENTS_REPOSITORY } from '@/shared/constants/repositories';
import { BusinessRuleViolationError, ResourceNotFoundError } from '@/shared/errors/types';

import {
  InMemoryAppointmentRepository,
  makeAppointment,
} from '../../../../../test/factories/in-memory-appointment.repository';
import { AppointmentStatus } from '../../model-entities/appointment.entity';
import { AddConsultationNoteService } from './add-consultation-note.service';

describe('AddConsultationNoteService', () => {
  let service: AddConsultationNoteService;
  let appointments: InMemoryAppointmentRepository;

  beforeEach(async () => {
    appointments = new InMemoryAppointmentRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AddConsultationNoteService,
        { provide: APPOINTMENTS_REPOSITORY, useValue: appointments },
      ],
    }).compile();

    service = moduleRef.get(AddConsultationNoteService);
  });

  it('grava a anotação e devolve a nota com identidade', async () => {
    const appointment = makeAppointment();
    appointments.items.push(appointment);

    const result = await service.execute({
      doctorId: 'doctor-1',
      appointmentId: appointment.id,
      content: 'Paciente relatou melhora após o repouso.',
    });

    expect(result.isRight()).toBe(true);
    // `id` e `createdAt` vêm do banco (aqui, do duplo que reproduz o `RETURNING`).
    // Sem eles o presenter quebraria no `toISOString()` — e o teste que só olhasse
    // `isRight()` passaria mesmo assim.
    expect((result.value as { id: string }).id).toBeTruthy();
    expect((result.value as { createdAt: Date }).createdAt).toBeInstanceOf(Date);
    expect(appointments.items[0].notes).toHaveLength(1);
  });

  // INV-05 chega aqui pela entity; o service só propaga.
  it('recusa anotação em consulta cancelada, sem gravar nada', async () => {
    const appointment = makeAppointment({ status: AppointmentStatus.CANCELLED });
    appointments.items.push(appointment);

    const result = await service.execute({
      doctorId: 'doctor-1',
      appointmentId: appointment.id,
      content: 'não deve entrar',
    });

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(BusinessRuleViolationError);
    expect(appointments.items[0].notes).toBeUndefined();
  });

  it('aceita anotação em consulta concluída', async () => {
    const appointment = makeAppointment({ status: AppointmentStatus.COMPLETED });
    appointments.items.push(appointment);

    const result = await service.execute({
      doctorId: 'doctor-1',
      appointmentId: appointment.id,
      content: 'Retorno em 30 dias.',
    });

    expect(result.isRight()).toBe(true);
  });

  // INV-04: as duas ausências têm de ser indistinguíveis, senão o 404 vira um
  // oráculo que confirma a existência da agenda de outro médico.
  it('responde igual para consulta de outro médico e consulta inexistente', async () => {
    const alheia = makeAppointment({ doctorId: 'doctor-2' });
    appointments.items.push(alheia);

    const doOutro = await service.execute({
      doctorId: 'doctor-1',
      appointmentId: alheia.id,
      content: 'invasão',
    });
    const inexistente = await service.execute({
      doctorId: 'doctor-1',
      appointmentId: 'nao-existe',
      content: 'invasão',
    });

    expect(doOutro.value).toBeInstanceOf(ResourceNotFoundError);
    expect((doOutro.value as Error).message).toBe((inexistente.value as Error).message);
    // E nada foi escrito na consulta alheia.
    expect(alheia.notes).toBeUndefined();
  });

  it('acumula anotações na mesma consulta, sem apagar as anteriores', async () => {
    const appointment = makeAppointment();
    appointments.items.push(appointment);

    await service.execute({
      doctorId: 'doctor-1',
      appointmentId: appointment.id,
      content: 'primeira',
    });
    await service.execute({
      doctorId: 'doctor-1',
      appointmentId: appointment.id,
      content: 'segunda',
    });

    expect(appointments.items[0].notes?.map((note) => note.content)).toEqual([
      'primeira',
      'segunda',
    ]);
  });
});
