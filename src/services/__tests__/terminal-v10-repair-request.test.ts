import { describe, it, expect } from 'vitest';
import { TERMINAL_REPAIR as S, CENTERED_REPAIR, assertCenteredRepairReservation, assertRepairReservation, centeredRepairPrompt, repairPrompt, repairTarget } from '../../../scripts/lib/terminal-v10-repair-request';
import { localPatchBoardForVersion } from '../../domain/scene/local-patch-catalog';

describe('bounded terminal v10 candidate requests', () => {
  it('pins the separate one-image Antarctica authorization and smaller cap', () => {
    assertCenteredRepairReservation(CENTERED_REPAIR.worldId, 'image:antarctica:1', 0, 150_000);
    assertCenteredRepairReservation(CENTERED_REPAIR.worldId, 'review:antarctica:1', 150_000, 40_000);
    for (const key of ['image:antarctica:2', 'image:giza:1', 'review:giza:1'])
      expect(() => assertCenteredRepairReservation(CENTERED_REPAIR.worldId, key, 0, 150_000)).toThrow();
    expect(() => assertCenteredRepairReservation(S.worldId, 'image:antarctica:1', 0, 150_000)).toThrow();
    expect(() => assertCenteredRepairReservation(CENTERED_REPAIR.worldId, 'review:antarctica:1', 210_001, 40_000)).toThrow();
    expect(() => assertCenteredRepairReservation(CENTERED_REPAIR.worldId, 'review:antarctica:1', 0, 40_001)).toThrow();
    const prompt = centeredRepairPrompt(localPatchBoardForVersion('antarctica', 10)!, { left: 163, top: 248, width: 171, height: 377 });
    expect(prompt).toContain('y258..343'); expect(prompt).not.toContain('y=368..745');
  });
  it('restricts targets and the one-shot keys', () => {
    for (const slug of S.targets) {
      assertRepairReservation(S.worldId, `image:${slug}:1`, 0, 150_000);
      expect(() => assertRepairReservation(S.worldId, `image:${slug}:2`, 0, 150_000)).toThrow();
    }
    expect(() => assertRepairReservation('live-game', 'image:giza:1', 0, 150_000)).toThrow();
    expect(() => assertRepairReservation(S.worldId, 'image:paris:1', 0, 150_000)).toThrow();
  });
  it('includes outstanding reservations in a strict dollar ceiling', () => {
    assertRepairReservation(S.worldId, 'image:giza:1', 850_000, 150_000);
    for (const [spent, hold] of [[850_001, 150_000], [0, 150_001], [-1, 1], [0, 0], [NaN, 1]])
      expect(() => assertRepairReservation(S.worldId, 'image:giza:1', spent!, hold!)).toThrow();
  });
  it('keeps original authored geometry and distinguishes replacement from insertion', () => {
    const antarctica = localPatchBoardForVersion('antarctica', 10)!;
    const giza = localPatchBoardForVersion('giza', 10)!;
    expect(repairTarget(antarctica)).toEqual(antarctica.hides[2]);
    expect(repairTarget(giza)).toEqual(giza.hides[1]);
    expect(repairPrompt(antarctica)).toContain('LOWER STANDING');
    expect(repairPrompt(antarctica)).toContain('UPPER kneeling');
    expect(repairPrompt(giza)).toContain('NOT replacement of an existing person');
    expect(() => repairTarget(localPatchBoardForVersion('paris', 10)!)).toThrow();
    expect(S.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
