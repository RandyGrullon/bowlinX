import type { SheetData } from 'write-excel-file/browser';
import { eventLabel } from './format';
import { category, entryLine, rank, teamLines } from './stats';
import type { BowlingEvent, Entry, Player } from './types';

const head = (labels: string[]) => labels.map((value) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#E8E7FB' }));

/**
 * Descarga el torneo (o la práctica) en Excel, como el del torneo 2025: hoja individual y hoja de equipos.
 * Solo cuentan los juegos verificados, igual que la clasificación.
 */
export async function exportEventToExcel(event: BowlingEvent, entries: Entry[], players: Player[]) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '(jugador borrado)';
  const isTorneo = event.type === 'torneo';
  const lines = entries.map((e) => entryLine(e, event)).filter((l) => l.games > 0);
  const games = Array.from({ length: event.games }, (_, i) => `Juego ${i + 1}`);
  const sheets: { data: SheetData; sheet: string; columns: { width: number }[]; stickyRowsCount: number }[] = [];

  if (isTorneo) {
    const useHcp = event.hcpPercent > 0 && (event.individualRankBy ?? 'hcp') === 'hcp';
    const teamName = (id: string | null) => (id && event.teams?.[id]?.name) || '';
    const ranked = rank(lines, (l) => (useHcp ? l.total : l.scratch));
    sheets.push({
      sheet: 'Individual',
      stickyRowsCount: 1,
      columns: [{ width: 9 }, { width: 28 }, { width: 22 }, { width: 10 }, { width: 10 }, { width: 8 }, ...games.map(() => ({ width: 9 })), { width: 14 }, { width: 14 }],
      data: [
        head(['Posición', 'Jugador', 'Equipo', 'Categoría', 'Promedio', 'HCP', ...games, 'Total scratch', 'Total con HCP']),
        ...ranked.map(({ row: l, pos }) => [
          { value: pos },
          { value: nameOf(l.entry.playerId) },
          { value: teamName(l.entry.teamId) },
          { value: category(l.entry.average, event.categoryCuts) },
          { value: l.entry.average },
          { value: l.hcp },
          ...l.scores.map((s) => ({ value: s ?? undefined })),
          { value: l.scratch },
          { value: l.total, fontWeight: 'bold' as const },
        ]),
      ],
    });

    const teamHcp = event.hcpPercent > 0 && (event.teamRankBy ?? 'scratch') === 'hcp';
    const teams = rank(
      teamLines(event, lines).filter((t) => t.members.length),
      (t) => (teamHcp ? t.total : t.scratch),
    );
    if (teams.length) {
      sheets.push({
        sheet: 'Equipos',
        stickyRowsCount: 1,
        columns: [{ width: 9 }, { width: 24 }, { width: 60 }, ...games.map(() => ({ width: 9 })), { width: 14 }, { width: 8 }, { width: 14 }],
        data: [
          head(['Lugar', 'Equipo', 'Integrantes', ...games, 'Total scratch', 'HCP', 'Total con HCP']),
          ...teams.map(({ row: t, pos }) => [
            { value: pos },
            { value: t.name, fontWeight: 'bold' as const },
            { value: t.members.map((m) => nameOf(m.entry.playerId)).join(', ') },
            ...t.perGame.map((_, g) => ({ value: t.members.reduce((s, m) => s + (m.scores[g] ?? 0), 0) })),
            { value: t.scratch, fontWeight: teamHcp ? undefined : ('bold' as const) },
            { value: t.hcpTotal },
            { value: t.total, fontWeight: teamHcp ? ('bold' as const) : undefined },
          ]),
        ],
      });
    }
  } else {
    const ranked = rank(lines, (l) => l.avg);
    sheets.push({
      sheet: 'Resultados',
      stickyRowsCount: 1,
      columns: [{ width: 9 }, { width: 28 }, ...games.map(() => ({ width: 9 })), { width: 10 }, { width: 10 }, { width: 10 }],
      data: [
        head(['Posición', 'Jugador', ...games, 'Total', 'Promedio', 'Mejor']),
        ...ranked.map(({ row: l, pos }) => [
          { value: pos },
          { value: nameOf(l.entry.playerId) },
          ...l.scores.map((s) => ({ value: s ?? undefined })),
          { value: l.scratch },
          { value: l.avg, fontWeight: 'bold' as const },
          { value: l.high },
        ]),
      ],
    });
  }

  await writeExcelFile(sheets).toFile(`${eventLabel(event)} - ${event.date}.xlsx`);
}
