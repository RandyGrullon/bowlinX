import { describe, expect, it } from 'vitest';
import { frameStats, maxNextRoll, scoreGame, standingMask, standingNow, validRolls, ALL_PINS } from './bowling';

const rep = (n: number, ...rolls: number[]) => Array.from({ length: n }, () => rolls).flat();

describe('puntaje', () => {
  it('juego perfecto = 300', () => {
    const g = scoreGame(rep(12, 10));
    expect(g.score).toBe(300);
    expect(g.complete).toBe(true);
    expect(g.frames[9].marks).toEqual(['X', 'X', 'X']);
    expect(g.frames.map((f) => f.total)).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 270, 300]);
  });

  it('todo 5 y spare = 150', () => {
    const g = scoreGame(rep(21, 5));
    expect(g.score).toBe(150);
    expect(g.complete).toBe(true);
    expect(g.frames[0].marks).toEqual(['5', '/']);
  });

  it('todo en el canal = 0', () => {
    const g = scoreGame(rep(20, 0));
    expect(g.score).toBe(0);
    expect(g.complete).toBe(true);
    expect(g.frames[0].marks).toEqual(['-', '-']);
  });

  it('9 y fallo en todos = 90', () => {
    const g = scoreGame(rep(10, 9, 0));
    expect(g.score).toBe(90);
    expect(g.complete).toBe(true);
  });

  it('strike deja el acumulado pendiente hasta tener dos tiros más', () => {
    expect(scoreGame([10]).frames[0].total).toBeNull();
    expect(scoreGame([10, 3]).frames[0].total).toBeNull();
    const g = scoreGame([10, 3, 4]);
    expect(g.frames.map((f) => f.total)).toEqual([17, 24]);
    expect(g.complete).toBe(false);
  });

  it('spare en el 10 da un tiro más', () => {
    const rolls = [...rep(9, 0, 0), 7, 3];
    expect(scoreGame(rolls).complete).toBe(false);
    expect(maxNextRoll(rolls)).toBe(10);
    const g = scoreGame([...rolls, 10]);
    expect(g.score).toBe(20);
    expect(g.frames[9].marks).toEqual(['7', '/', 'X']);
    expect(g.complete).toBe(true);
  });

  it('en el 10: X y luego 7 deja solo 3 para el último tiro', () => {
    const rolls = [...rep(9, 0, 0), 10, 7];
    expect(maxNextRoll(rolls)).toBe(3);
    expect(scoreGame([...rolls, 3]).frames[9].marks).toEqual(['X', '7', '/']);
  });

  it('en el 10 sin marca no hay tercer tiro', () => {
    expect(scoreGame([...rep(9, 0, 0), 4, 4]).complete).toBe(true);
    expect(maxNextRoll([...rep(9, 0, 0), 4, 4])).toBe(-1);
  });
});

describe('tiros posibles', () => {
  it('después de 8 solo quedan 2', () => {
    expect(maxNextRoll([8])).toBe(2);
    expect(standingNow([8])).toMatchObject({ standing: 2, fresh: false, frame: 0, roll: 1 });
  });
  it('después de un strike vuelve a haber 10', () => {
    expect(standingNow([10])).toMatchObject({ standing: 10, fresh: true, frame: 1, roll: 0 });
  });
  it('valida la lista completa', () => {
    expect(validRolls([8, 2, 10, 3])).toBe(true);
    expect(validRolls([8, 3])).toBe(false);
    expect(validRolls(rep(13, 10))).toBe(false);
  });
});

describe('estadísticas de cuadros', () => {
  it('cuenta strikes, spares y abiertos', () => {
    // X, 7/, 9-, X, X, 8/, 7-, X, 9/, X X 8
    const rolls = [10, 7, 3, 9, 0, 10, 10, 8, 2, 7, 0, 10, 9, 1, 10, 10, 8];
    const s = frameStats(rolls);
    expect(s.strikes).toBe(6);
    expect(s.spares).toBe(3);
    expect(s.opens).toBe(2);
    expect(scoreGame(rolls).complete).toBe(true);
  });
});

describe('pines parados', () => {
  it('con máscara quedan los pines que no cayeron', () => {
    // cayeron del 1 al 8
    const knocked = 0b00_1111_1111;
    expect(standingMask([8], [knocked])).toBe(ALL_PINS & ~knocked);
  });
  it('rack nuevo después de un strike', () => {
    expect(standingMask([10], [ALL_PINS])).toBe(ALL_PINS);
  });
});
