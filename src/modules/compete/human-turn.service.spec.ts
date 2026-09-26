import { HumanTurnService } from './human-turn.service';

describe('HumanTurnService authorization', () => {
  let service: HumanTurnService;

  beforeEach(() => {
    service = new HumanTurnService();
  });

  it('delivers a turn only to its owner and allows same-owner connections', async () => {
    const ownerA: string[] = [];
    const ownerB: string[] = [];
    const ownerA2: string[] = [];
    service.registerSSEClient(8, 11, (data) => ownerA.push(data));
    service.registerSSEClient(8, 22, (data) => ownerB.push(data));
    service.registerSSEClient(8, 11, (data) => ownerA2.push(data));

    const pending = service.waitForResponse(8, 31, { state: 1 }, 10_000, 11);
    expect(ownerA).toHaveLength(1);
    expect(ownerA2).toHaveLength(1);
    expect(ownerB).toHaveLength(0);
    const turnToken = JSON.parse(ownerA[0]).turnToken;
    expect(service.submitResponse(turnToken, 'move', 22)).toBe(false);
    expect(service.submitResponse(turnToken, 'move', 11)).toBe(true);
    await expect(pending).resolves.toBe('move');
  });

  it('removes only the closed SSE connection', () => {
    const a: string[] = [];
    const b: string[] = [];
    const connectionA = service.registerSSEClient(8, 11, (data) => a.push(data));
    service.registerSSEClient(8, 11, (data) => b.push(data));
    service.unregisterSSEClient(connectionA);

    service.notifyGameOver(8, { '31': 1 });
    expect(a).toHaveLength(0);
    expect(b).toHaveLength(1);
  });
});
