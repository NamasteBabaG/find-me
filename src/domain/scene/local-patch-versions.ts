/** Explicit releases: paid games never resolve to an implicit latest version. */
export const REFRESHED_COLLECTION_VERSION = 11;
export const INTEGRATED_COLLECTION_VERSION = 12;
export const isRefreshedCollectionVersion = (version: number | undefined) => version === REFRESHED_COLLECTION_VERSION || version === INTEGRATED_COLLECTION_VERSION;
export const isCollectionVersion = (version: number | undefined) => version === 10 || isRefreshedCollectionVersion(version);
