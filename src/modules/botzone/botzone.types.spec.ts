import {
  BOTZONE_VERDICT_TO_LEVERAGE,
  BOTZONE_STATE_TO_LEVERAGE,
  BOTZONE_TERMINAL_STATES,
  BotzoneVerdict,
  BotzoneJobState,
  LEVERAGE_LANG_TO_BOTZONE,
  botzoneStateToStatus,
  resolveBotzoneLanguage,
} from './botzone.types';
import { Status } from '../heng/heng.types';

describe('botzone.types', () => {
  // ─── Verdict → Status mapping ─────────────────────────────────────────────

  describe('BOTZONE_VERDICT_TO_LEVERAGE', () => {
    it('maps all BotzoneVerdict values without gaps', () => {
      const allVerdicts: BotzoneVerdict[] = [
        'Accepted',
        'WrongAnswer',
        'TimeLimitExceeded',
        'MemoryLimitExceeded',
        'RuntimeError',
        'CompileError',
        'SystemError',
        'OutputLimitExceeded',
        'PresentationError',
      ];
      for (const v of allVerdicts) {
        expect(BOTZONE_VERDICT_TO_LEVERAGE[v]).toBeDefined();
      }
    });

    it('Accepted → Status.AC', () => {
      expect(BOTZONE_VERDICT_TO_LEVERAGE['Accepted']).toBe(Status.AC);
    });

    it('WrongAnswer → Status.WA', () => {
      expect(BOTZONE_VERDICT_TO_LEVERAGE['WrongAnswer']).toBe(Status.WA);
    });

    it('TimeLimitExceeded → Status.TLE', () => {
      expect(BOTZONE_VERDICT_TO_LEVERAGE['TimeLimitExceeded']).toBe(Status.TLE);
    });

    it('MemoryLimitExceeded → Status.MLE', () => {
      expect(BOTZONE_VERDICT_TO_LEVERAGE['MemoryLimitExceeded']).toBe(Status.MLE);
    });

    it('CompileError → Status.CE', () => {
      expect(BOTZONE_VERDICT_TO_LEVERAGE['CompileError']).toBe(Status.CE);
    });

    it('SystemError → Status.SE', () => {
      expect(BOTZONE_VERDICT_TO_LEVERAGE['SystemError']).toBe(Status.SE);
    });

    it('RuntimeError → Status.RE', () => {
      expect(BOTZONE_VERDICT_TO_LEVERAGE['RuntimeError']).toBe(Status.RE);
    });

    it('PresentationError → Status.PE', () => {
      expect(BOTZONE_VERDICT_TO_LEVERAGE['PresentationError']).toBe(Status.PE);
    });

    it('OutputLimitExceeded → Status.OLE', () => {
      expect(BOTZONE_VERDICT_TO_LEVERAGE['OutputLimitExceeded']).toBe(Status.OLE);
    });
  });

  // ─── State → Status mapping ───────────────────────────────────────────────

  describe('BOTZONE_STATE_TO_LEVERAGE', () => {
    it('pending → Status.PENDING', () => {
      expect(BOTZONE_STATE_TO_LEVERAGE['pending']).toBe(Status.PENDING);
    });

    it('queued → Status.PENDING', () => {
      expect(BOTZONE_STATE_TO_LEVERAGE['queued']).toBe(Status.PENDING);
    });

    it('compiling → Status.COMPILING', () => {
      expect(BOTZONE_STATE_TO_LEVERAGE['compiling']).toBe(Status.COMPILING);
    });

    it('running → Status.JUDGING', () => {
      expect(BOTZONE_STATE_TO_LEVERAGE['running']).toBe(Status.JUDGING);
    });

    it('failed → Status.SE', () => {
      expect(BOTZONE_STATE_TO_LEVERAGE['failed']).toBe(Status.SE);
    });
  });

  // ─── Terminal state set ───────────────────────────────────────────────────

  describe('BOTZONE_TERMINAL_STATES', () => {
    it('includes finished and failed', () => {
      expect(BOTZONE_TERMINAL_STATES.has('finished')).toBe(true);
      expect(BOTZONE_TERMINAL_STATES.has('failed')).toBe(true);
    });

    it('does NOT include in-progress states', () => {
      const inProgress: BotzoneJobState[] = ['pending', 'queued', 'compiling', 'running'];
      for (const s of inProgress) {
        expect(BOTZONE_TERMINAL_STATES.has(s)).toBe(false);
      }
    });

    it('terminal set includes Bull completed and the two legacy terminals', () => {
      expect([...BOTZONE_TERMINAL_STATES].sort()).toEqual(['completed', 'failed', 'finished']);
    });
  });

  // ─── botzoneStateToStatus helper ──────────────────────────────────────────

  describe('botzoneStateToStatus', () => {
    it('failed → SE (no result)', () => {
      expect(botzoneStateToStatus('failed')).toBe(Status.SE);
    });

    it('failed → SE (with result)', () => {
      expect(botzoneStateToStatus('failed', { verdict: 'Accepted', testcases: [] } as any)).toBe(Status.SE);
    });

    it('finished with no result → SE', () => {
      expect(botzoneStateToStatus('finished')).toBe(Status.SE);
    });

    it('finished with Accepted verdict → AC', () => {
      const result = { verdict: 'Accepted', testcases: [] } as any;
      expect(botzoneStateToStatus('finished', result)).toBe(Status.AC);
    });

    it('finished with WrongAnswer verdict → WA', () => {
      const result = { verdict: 'WrongAnswer', testcases: [] } as any;
      expect(botzoneStateToStatus('finished', result)).toBe(Status.WA);
    });

    it('finished with CompileError verdict → CE', () => {
      const result = { verdict: 'CompileError', testcases: [] } as any;
      expect(botzoneStateToStatus('finished', result)).toBe(Status.CE);
    });

    it('running → JUDGING', () => {
      expect(botzoneStateToStatus('running')).toBe(Status.JUDGING);
    });

    it('pending → PENDING', () => {
      expect(botzoneStateToStatus('pending')).toBe(Status.PENDING);
    });

    it('compiling → COMPILING', () => {
      expect(botzoneStateToStatus('compiling')).toBe(Status.COMPILING);
    });
  });

  // ─── Language mapping ──────────────────────────────────────────────────────

  describe('LEVERAGE_LANG_TO_BOTZONE', () => {
    it('rejects language 0 (C)', () => {
      expect(LEVERAGE_LANG_TO_BOTZONE[0]).toBeUndefined();
    });

    it('rejects language 1 (C++11)', () => {
      expect(LEVERAGE_LANG_TO_BOTZONE[1]).toBeUndefined();
    });

    it('rejects language 6 (Java)', () => {
      expect(LEVERAGE_LANG_TO_BOTZONE[6]).toBeUndefined();
    });

    it('maps language 9 (Python3) to python', () => {
      expect(LEVERAGE_LANG_TO_BOTZONE[9]).toBe('python');
    });

    it('maps language 10 (JS) to "javascript"', () => {
      expect(LEVERAGE_LANG_TO_BOTZONE[10]).toBe('javascript');
    });
  });
  it('only maps supported numeric OJ runtimes', () => {
    expect(LEVERAGE_LANG_TO_BOTZONE).toEqual({
      3: 'cpp', 9: 'python',
      10: 'javascript', 11: 'typescript',
    });
  });
  it('resolves canonical runtimes and only known legacy aliases', () => {
    for (const runtime of ['cpp', 'python', 'javascript', 'typescript'] as const) {
      expect(resolveBotzoneLanguage(runtime)).toBe(runtime);
    }
    expect(resolveBotzoneLanguage('cpp17')).toBe('cpp');
    expect(resolveBotzoneLanguage('python3')).toBe('python');
    for (const runtime of ['java', 'go', 'c', 'python2', 'cpp11', '']) {
      expect(resolveBotzoneLanguage(runtime)).toBeUndefined();
    }
  });
});
