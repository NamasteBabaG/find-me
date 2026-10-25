import type { Prisma } from '@prisma/client';
import { EXPLORERS_OPERATIONAL_RELEASE } from '../../domain/generation/explorers-operational-policy';
import { explorersOperationalPolicyOf } from './explorers-operational-policy';
import type { Container } from '../container';
import { detectivesSingleReviewAuthorization, hasDetectivesLowCapacity } from './detectives-completion-budget';
import { detectivesOperationalPolicyOf } from './detectives-operational-policy';
import { subjectUpgradeOf } from './subject-enrollment';
import { boardWizardBudgetOf } from './board-conditioned-wizard';
export async function singleLowReviewAuthorization(db: Pick<Prisma.TransactionClient, 'auditLog'>, gameId: string) { const historic = await detectivesSingleReviewAuthorization(db, gameId); if (historic)
    return { kind: 'historical' as const, sceneVersion: 13 as const, authorizationSha256: historic.authorizationSha256, identitySha256: historic.identitySha256 }; const born = await detectivesOperationalPolicyOf(db, gameId) ?? await explorersOperationalPolicyOf(db, gameId); if (!born)
    return null; const subject = await subjectUpgradeOf(db, gameId); return subject ? { kind: 'from-birth' as const, sceneVersion: born.version === EXPLORERS_OPERATIONAL_RELEASE ? 12 as const : 13 as const, authorizationSha256: born.authorizationSha256, identitySha256: subject.identitySha256 } : null; }
export async function hasSingleLowCapacity(c: Container, gameId: string) { const authority = await singleLowReviewAuthorization(c.db, gameId); if (!authority)
    return false; if (authority.kind === 'historical')
    return hasDetectivesLowCapacity(c, gameId); const budget = await boardWizardBudgetOf(c).audit(gameId + ':board-wizard'); return budget.capMicroUsd >= 4000000 && !budget.overCapMicroUsd && !budget.conflictRequestKeys.length && !budget.overrunRequestKeys.length; }
