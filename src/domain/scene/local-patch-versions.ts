/** Explicit releases: paid games never resolve to an implicit latest version. */
export const REFRESHED_COLLECTION_VERSION = 11;
export const isCollectionVersion = (version: number | undefined) => version === 10 || version === REFRESHED_COLLECTION_VERSION;
