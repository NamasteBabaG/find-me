/** Explicit releases: paid games never resolve to an implicit latest version. */
export const REFRESHED_COLLECTION_VERSION = 11;
export const INTEGRATED_COLLECTION_VERSION = 12;
/** A distinct search-level family; never an alias of the v12 Explorer sources. */
export const DETECTIVES_SCENE_VERSION = 13;
export const isRefreshedCollectionVersion = (version: number | undefined) => version === REFRESHED_COLLECTION_VERSION || version === INTEGRATED_COLLECTION_VERSION;
export const isCollectionVersion = (version: number | undefined) => version === 10 || isRefreshedCollectionVersion(version) || version === DETECTIVES_SCENE_VERSION;
