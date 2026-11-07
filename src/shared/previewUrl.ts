export const previewScheme = "deduup-preview";
export type PreviewKind = "thumbnail" | "full";

/** The original-resolution URL for the same file and revision as a thumbnail URL. */
export const toFullPreviewUrl = (thumbnailUrl: string): string => thumbnailUrl.replace(`${previewScheme}://thumbnail/`, `${previewScheme}://full/`);
