import { Test } from '@nestjs/testing';

import { APPOINTMENTS_REPOSITORY } from '@/shared/constants/repositories';
import { BusinessRuleViolationError, ResourceNotFoundError } from '@/shared/errors/types';

import {
  InMemoryAppointmentRepository,
  makeAppointment,
} from '../../../../../test/factories/in-memory-appointment.repository';
import { AppointmentStatus } from '../../model-entities/appointment.entity';
import { CancelAppointmentService } from './cancel-appointment.service';

describe('CancelAppointmentService', () => {
  let service: CancelAppointmentService;
  let repository: InMemoryAppointmentRepository;

  beforeEach(async () => {
    repository = new InMemoryAppointmentRepository();

    const moduleRef = await Test.createTestingModule({
      providers: [
        CancelAppointmentService,
        { provide: APPOINTMENTS_REPOSITORY, useValue: repository },
      ],
    }).compile();

    service = moduleRef.get(CancelAppointmentService);
  });

  it('cancela a consulta mantendo a linha', async () => {
    const appointment = makeAppointment();
    repository.items.push(appointment);

    const result = await service.execute({
      doctorId: 'doctor-1',
      appointmentId: appointment.id,
    });

    expect(result.isRight()).toBe(true);
    expect(appointment.status).toBe(AppointmentStatus.CANCELLED);
    // A linha permanece: `DELETE` cancela, não apaga.
    expect(repository.items).toHaveLength(1);
  });

  it('é idempotente com consulta já cancelada', async () => {
    const appointment = makeAppointment({ status: AppointmentStatus.CANCELLED });
    repository.items.push(appointment);

    const result = await service.execute({
      doctorId: 'doctor-1',
      appointmentId: appointment.id,
    });

    expect(result.isRight()).toBe(true);
    expect(appointment.status).toBe(AppointmentStatus.CANCELLED);
  });

  it('recusa cancelar consulta **concluída** com 422', async () => {
    const appointment = makeAppointment({ status: AppointmentStatus.COMPLETED });
    repository.items.push(appointment);

    const result = await service.execute({
      doctorId: 'doctor-1',
      appointmentId: appointment.id,
    });

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(BusinessRuleViolationError);
    // Cancelar o que já foi atendido apagaria o registro de que aconteceu.
    expect(appointment.status).toBe(AppointmentStatus.COMPLETED);
  });

  it('recusa agendamento de outro médico com 404, sem cancelá-lo', async () => {
    const alheio = makeAppointment({ doctorId: 'doctor-2' });
    repository.items.push(alheio);

    const result = await service.execute({ doctorId: 'doctor-1', appointmentId: alheio.id });

    expect(result.value).toBeInstanceOf(ResourceNotFoundError);
    expect(alheio.status).toBe(AppointmentStatus.SCHEDULED);
  });
});
