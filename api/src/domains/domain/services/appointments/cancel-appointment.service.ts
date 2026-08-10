import { Inject, Injectable } from '@nestjs/common';

import { APPOINTMENTS_REPOSITORY } from '@/shared/constants/repositories';
import { Either, left, right } from '@/shared/errors/either';
import { BusinessRuleViolationError, ResourceNotFoundError } from '@/shared/errors/types';

import { AppointmentStatus } from '../../model-entities/appointment.entity';
import { AppointmentRepository } from '../../repositories/appointment.repository';
import { APPOINTMENT_NOT_FOUND_MESSAGE } from './get-appointment.service';

export interface CancelAppointmentRequest {
  doctorId: string;
  appointmentId: string;
}

export type CancelAppointmentResult = Either<
  ResourceNotFoundError | BusinessRuleViolationError,
  void
>;

/**
 * Cancela a consulta — o "excluir" que não apaga.
 *
 * A linha permanece no banco e o status vira `CANCELLED`. Apagar de verdade
 * destruiria a trilha de atendimento, e liberaria o horário por **remoção** em vez
 * de por regra. Do jeito escolhido, o horário volta a aceitar agendamento e o
 * banco continua contando o que aconteceu.
 *
 * Três desfechos, e eles se comportam diferente de propósito:
 *   · consulta de outro médico, ou inexistente → 404, o mesmo texto para os dois;
 *   · consulta já **concluída** → 422 (cancelar apagaria o registro do atendimento);
 *   · consulta já cancelada → 204, igual à primeira vez. Não é erro.
 *
 * Atende RF-04. Mais detalhes: PRODUCT.md — INV-04, §regras.
 */
@Injectable()
export class CancelAppointmentService {
  constructor(
    @Inject(APPOINTMENTS_REPOSITORY)
    private readonly appointmentRepository: AppointmentRepository,
  ) {}

  async execute({
    doctorId,
    appointmentId,
  }: CancelAppointmentRequest): Promise<CancelAppointmentResult> {
    // A busca já leva o médico do token junto. Consulta de outro consultório não
    // "existe e é negada": ela simplesmente não é encontrada, e cai no mesmo 404 do
    // id que nunca existiu.
    const appointment = await this.appointmentRepository.findByIdForDoctor(appointmentId, doctorId);

    if (!appointment) {
      return left(new ResourceNotFoundError(APPOINTMENT_NOT_FOUND_MESSAGE));
    }

    // Já cancelada: sai sem escrever nada. A resposta é o mesmo 204, e ir ao banco
    // só mexeria no carimbo de atualização sem mudar fato nenhum. É isto que faz
    // cancelar duas vezes ser inofensivo — um retry de rede não vira erro.
    if (appointment.status === AppointmentStatus.CANCELLED) {
      return right(undefined);
    }

    // Quem decide se esta consulta pode ser cancelada é a própria consulta, não
    // este service. A regra é sobre o estado dela.
    const cancelled = appointment.cancel();

    // Só sobra um motivo de recusa: a consulta já foi concluída. Cancelar o que já
    // foi atendido apagaria o registro de que o atendimento aconteceu — e é
    // justamente esse histórico que o prontuário existe para guardar.
    if (cancelled.isLeft()) {
      return left(cancelled.value);
    }

    await this.appointmentRepository.save(appointment, doctorId);

    return right(undefined);
  }
}
