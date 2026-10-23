/** Maximum accepted distance for a match and for a set's average distance. */
export const matchDistanceLimit = 13;

/** Review bands and bulk actions use the same displayed precision. */
export const getSimilarityLabel = (distance: number): string => distance.toFixed(1);
