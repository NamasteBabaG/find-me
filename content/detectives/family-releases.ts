/** Server-side frozen release authority; never imported by the client catalog. */
import * as journey from './source-placement-release';
import * as kingdom from './kingdom/source-placement-release';
import type { DetectiveWorld } from './families';
export function detectivePlacementFamily(world: DetectiveWorld) {
  // Explicit aliases preserve the original Journey constants and serialization.
  if(world==='journey') {
    journey.assertDetectiveSourcePlacementReleaseHash();
    return {familyId:'journey-detectives/v1' as const,worldSlug:world,releaseId:journey.DETECTIVE_SOURCE_PLACEMENT_RELEASE_ID,
      manifest:journey.DETECTIVE_SOURCE_PLACEMENT_RELEASE,base:journey.DETECTIVE_SOURCE_PLACEMENT_BASE,
      manifestSha256:journey.DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256,sourceInputSha256:journey.DETECTIVE_SOURCE_INPUT_SHA256,
      runtimeCatalogSha256:journey.DETECTIVE_RUNTIME_CATALOG_SHA256,identityStyleSha256:journey.DETECTIVE_IDENTITY_STYLE_SHA256};
  }
  kingdom.assertDetectiveSourcePlacementReleaseHash();
  return {familyId:'kingdom-detectives/v1' as const,worldSlug:world,releaseId:kingdom.KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE_ID,
    manifest:kingdom.KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE,base:kingdom.KINGDOM_DETECTIVE_SOURCE_PLACEMENT_BASE,
    manifestSha256:kingdom.KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256,sourceInputSha256:kingdom.KINGDOM_DETECTIVE_SOURCE_INPUT_SHA256,
    runtimeCatalogSha256:kingdom.KINGDOM_DETECTIVE_RUNTIME_CATALOG_SHA256,identityStyleSha256:kingdom.KINGDOM_DETECTIVE_IDENTITY_STYLE_SHA256};
}
