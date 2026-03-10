import {
  BOTZONE_STATUS_TO_LEVERAGE,
  BOTZONE_TERMINAL_STATUSES,
  BotzoneJobStatus,
  LEVERAGE_LANG_TO_BOTZONE,
} from './botzone.types';
import { Status } from '../heng/heng.types';

describe('botzone.types', () => {
  // ─── Status mapping coverage ───────────────────────────────────────────────

  describe('BOTZONE_STATUS_TO_LEVERAGE', () => {
    it('maps all BotzoneJobStatus values without gaps', () => {
      const allStatuses = Object.values(BotzoneJobStatus);
      for (const s of allStatuses) {
        expect(BOTZONE_STATUS_TO_LEVERAGE[s]).toBeDefined();
      }
    });

    it('Accepted → Status.AC (0)', () => {
      expect(BOTZONE_STATUS_TO_LEVERAGE[BotzoneJobStatus.Accepted]).toBe(
        Status.AC,
      );
    });

    it('WrongAnswer → Status.WA (1)', () => {
      expect(BOTZONE_STATUS_TO_LEVERAGE[BotzoneJobStatus.WrongAnswer]).toBe(
        Status.WA,
      );
    });

    it('TimeLimitExceeded → Status.TLE (2)', () => {
      expect(
        BOTZONE_STATUS_TO_LEVERAGE[BotzoneJobStatus.TimeLimitExceeded],
      ).toBe(Status.TLE);
    });

    it('MemoryLimitExceeded → Status.MLE (3)', () => {
      expect(
        BOTZONE_STATUS_TO_LEVERAGE[BotzoneJobStatus.MemoryLimitExceeded],
      ).toBe(Status.MLE);
    });

    it('CompileError → Status.CE (4)', () => {
      expect(BOTZONE_STATUS_TO_LEVERAGE[BotzoneJobStatus.CompileError]).toBe(
        Status.CE,
      );
    });

    it('SystemError → Status.SE (5)', () => {
      expect(BOTZONE_STATUS_TO_LEVERAGE[BotzoneJobStatus.SystemError]).toBe(
        Status.SE,
      );
    });

    it('RuntimeError → Status.RE (6)', () => {
      expect(BOTZONE_STATUS_TO_LEVERAGE[BotzoneJobStatus.RuntimeError]).toBe(
        Status.RE,
      );
    });

    it('PresentationError → Status.PE (7)', () => {
      expect(
        BOTZONE_STATUS_TO_LEVERAGE[BotzoneJobStatus.PresentationError],
      ).toBe(Status.PE);
    });

    it('OutputLimitExceeded → Status.OLE (12)', () => {
      expect(
        BOTZONE_STATUS_TO_LEVERAGE[BotzoneJobStatus.OutputLimitExceeded],
      ).toBe(Status.OLE);
    });

    it('Pending → Status.PENDING (9)', () => {
      expect(BOTZONE_STATUS_TO_LEVERAGE[BotzoneJobStatus.Pending]).toBe(
        Status.PENDING,
      );
    });

    it('Queued → Status.PENDING (9)', () => {
      expect(BOTZONE_STATUS_TO_LEVERAGE[BotzoneJobStatus.Queued]).toBe(
        Status.PENDING,
      );
    });

    it('Compiling → Status.COMPILING (11)', () => {
      expect(BOTZONE_STATUS_TO_LEVERAGE[BotzoneJobStatus.Compiling]).toBe(
        Status.COMPILING,
      );
    });

    it('Running → Status.JUDGING (10)', () => {
      expect(BOTZONE_STATUS_TO_LEVERAGE[BotzoneJobStatus.Running]).toBe(
        Status.JUDGING,
      );
    });
  });

  // ─── Terminal status set ───────────────────────────────────────────────────

  describe('BOTZONE_TERMINAL_STATUSES', () => {
    it('includes all final result statuses', () => {
      const expectedTerminal = [
        BotzoneJobStatus.Accepted,
        BotzoneJobStatus.WrongAnswer,
        BotzoneJobStatus.TimeLimitExceeded,
        BotzoneJobStatus.MemoryLimitExceeded,
        BotzoneJobStatus.RuntimeError,
        BotzoneJobStatus.CompileError,
        BotzoneJobStatus.SystemError,
        BotzoneJobStatus.OutputLimitExceeded,
        BotzoneJobStatus.PresentationError,
      ];
      for (const s of expectedTerminal) {
        expect(BOTZONE_TERMINAL_STATUSES.has(s)).toBe(true);
      }
    });

    it('does NOT include transient statuses', () => {
      const transient = [
        BotzoneJobStatus.Pending,
        BotzoneJobStatus.Queued,
        BotzoneJobStatus.Compiling,
        BotzoneJobStatus.Running,
      ];
      for (const s of transient) {
        expect(BOTZONE_TERMINAL_STATUSES.has(s)).toBe(false);
      }
    });

    it('terminal set covers exactly 9 statuses', () => {
      expect(BOTZONE_TERMINAL_STATUSES.size).toBe(9);
    });
  });

  // ─── Language mapping ──────────────────────────────────────────────────────

  describe('LEVERAGE_LANG_TO_BOTZONE', () => {
    it('maps language 0 (C) to "c"', () => {
      expect(LEVERAGE_LANG_TO_BOTZONE[0]).toBe('c');
    });

    it('maps language 1 (C++) to "cpp11"', () => {
      expect(LEVERAGE_LANG_TO_BOTZONE[1]).toBe('cpp11');
    });

    it('maps language 6 (Java) to "java"', () => {
      expect(LEVERAGE_LANG_TO_BOTZONE[6]).toBe('java');
    });

    it('maps language 9 (Python3) to "python3"', () => {
      expect(LEVERAGE_LANG_TO_BOTZONE[9]).toBe('python3');
    });

    it('maps language 10 (JS) to "javascript"', () => {
      expect(LEVERAGE_LANG_TO_BOTZONE[10]).toBe('javascript');
    });
  });
});
