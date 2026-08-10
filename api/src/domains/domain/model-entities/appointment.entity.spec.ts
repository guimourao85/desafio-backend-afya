import { BusinessRuleViolationError } from '@/shared/errors/types';

import { Appointment, AppointmentStatus } from './appointment.entity';

function makeAppointment(status = AppointmentStatus.SCHEDULED): Appointment {
  return Object.assign(new Appointment(), {
    id: 'appointment-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    scheduledAt: new Date('2026-08-12T14:00:00.000Z'),
    status,
  });
}

const OUTRO_INSTANTE = new Date('2026-08-13T09:00:00.000Z');

/**
 * A máquina de estados tem spec próprio porque ela é a regra, não um detalhe dos
 * casos de uso. Testada aqui, os três services podem ser lidos como orquestração.
 */
describe('Appointment — máquina de estados', () => {
  describe('agendada (SCHEDULED)', () => {
    it('aceita reagendamento', () => {
      const appointment = makeAppointment();

      const result = appointment.rescheduleTo(OUTRO_INSTANTE);

      expect(result.isRight()).toBe(true);
      expect(appointment.scheduledAt).toBe(OUTRO_INSTANTE);
    });

    it('aceita conclusão', () => {
      const appointment = makeAppointment();

      expect(appointment.complete().isRight()).toBe(true);
      expect(appointment.status).toBe(AppointmentStatus.COMPLETED);
    });

    it('aceita cancelamento', () => {
      const appointment = makeAppointment();

      expect(appointment.cancel().isRight()).toBe(true);
      expect(appointment.status).toBe(AppointmentStatus.CANCELLED);
    });
  });

  describe('cancelada — terminal', () => {
    it('recusa reagendamento e **não** move a data', () => {
      const appointment = makeAppointment(AppointmentStatus.CANCELLED);
      const original = appointment.scheduledAt;

      const result = appointment.rescheduleTo(OUTRO_INSTANTE);

      expect(result.isLeft()).toBe(true);
      expect(result.value).toBeInstanceOf(BusinessRuleViolationError);
      expect(appointment.scheduledAt).toBe(original);
    });

    it('recusa conclusão', () => {
      const appointment = makeAppointment(AppointmentStatus.CANCELLED);

      expect(appointment.complete().isLeft()).toBe(true);
      expect(appointment.status).toBe(AppointmentStatus.CANCELLED);
    });

    // A assimetria que a fricção PRÉ desta sprint resolveu: repetir o cancelamento
    // não destrói informação, então é no-op e não erro.
    it('aceita cancelamento de novo, sem efeito', () => {
      const appointment = makeAppointment(AppointmentStatus.CANCELLED);

      expect(appointment.cancel().isRight()).toBe(true);
      expect(appointment.status).toBe(AppointmentStatus.CANCELLED);
    });
  });

  describe('concluída — terminal', () => {
    it('recusa reagendamento', () => {
      const appointment = makeAppointment(AppointmentStatus.COMPLETED);

      expect(appointment.rescheduleTo(OUTRO_INSTANTE).isLeft()).toBe(true);
    });

    it('recusa nova conclusão', () => {
      const appointment = makeAppointment(AppointmentStatus.COMPLETED);

      expect(appointment.complete().isLeft()).toBe(true);
    });

    // O outro lado da assimetria: aqui o cancelamento **apagaria** o registro de
    // que o atendimento aconteceu, então é recusa.
    it('recusa cancelamento e continua concluída', () => {
      const appointment = makeAppointment(AppointmentStatus.COMPLETED);

      const result = appointment.cancel();

      expect(result.isLeft()).toBe(true);
      expect(result.value).toBeInstanceOf(BusinessRuleViolationError);
      expect(appointment.status).toBe(AppointmentStatus.COMPLETED);
    });
  });

  /**
   * INV-05 mora aqui, e não num service, porque é regra sobre o estado da própria
   * consulta. O eixo é `isActive()`, não `isTerminal()`: **concluída aceita**
   * anotação — anota-se depois de atender, que é o caso normal.
   */
  describe('addNote — INV-05', () => {
    it('agendada aceita anotação', () => {
      const appointment = makeAppointment();

      const result = appointment.addNote('Queixa de dor lombar há três dias.');

      expect(result.isRight()).toBe(true);
      expect(appointment.notes).toHaveLength(1);
      expect(appointment.notes?.[0].appointmentId).toBe('appointment-1');
      expect(appointment.notes?.[0].content).toBe('Queixa de dor lombar há três dias.');
    });

    it('concluída aceita anotação — anota-se depois de atender', () => {
      const appointment = makeAppointment(AppointmentStatus.COMPLETED);

      expect(appointment.addNote('Prescrito anti-inflamatório por 5 dias.').isRight()).toBe(true);
      expect(appointment.notes).toHaveLength(1);
    });

    it('cancelada recusa, e não deixa rastro na lista', () => {
      const appointment = makeAppointment(AppointmentStatus.CANCELLED);

      const result = appointment.addNote('não deve entrar');

      expect(result.isLeft()).toBe(true);
      expect(result.value).toBeInstanceOf(BusinessRuleViolationError);
      expect((result.value as Error).message).toBe('Consulta cancelada não aceita anotações.');
      expect(appointment.notes).toBeUndefined();
    });

    it('acumula anotações na ordem em que foram escritas', () => {
      const appointment = makeAppointment();

      appointment.addNote('primeira');
      appointment.addNote('segunda');

      expect(appointment.notes?.map((note) => note.content)).toEqual(['primeira', 'segunda']);
    });

    // A raiz lida sem `relations` tem `notes` indefinido. Anotar nesse estado não
    // pode explodir nem — pior — fingir que a consulta não tinha nota nenhuma: o
    // `cascade` é `['insert']`, então o que não está na lista não é apagado.
    it('anota numa raiz carregada sem as anotações', () => {
      const appointment = makeAppointment();
      appointment.notes = undefined;

      expect(appointment.addNote('nota isolada').isRight()).toBe(true);
      expect(appointment.notes).toHaveLength(1);
    });
  });

  describe('predicados', () => {
    it.each([
      [AppointmentStatus.SCHEDULED, true, false],
      [AppointmentStatus.COMPLETED, true, true],
      [AppointmentStatus.CANCELLED, false, true],
    ])('%s → isActive=%s isTerminal=%s', (status, active, terminal) => {
      const appointment = makeAppointment(status);

      // `isActive` é o `status <> 'CANCELLED'` do índice parcial em forma de
      // método: se os dois divergirem, o banco e a aplicação discordam.
      expect(appointment.isActive()).toBe(active);
      expect(appointment.isTerminal()).toBe(terminal);
    });
  });
});
