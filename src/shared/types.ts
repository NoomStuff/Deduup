export interface ImageItem {
   file: string;
   originalPath: string;
   currentPath: string;
   folderPath: string;
   hash: string;
   width: number;
   height: number;
   size: number;
   previewUrl: string;
   fullPreviewUrl: string;
   exists: boolean;
   sourceStatus: "available" | "movedByApp" | "recycledByApp" | "missing";
}

export type FileActionStatus = "idle" | "moved" | "restored" | "recycled";

export interface ImageSet {
   id: string;
   similarity: number;
   folderPath: string;
   images: ImageItem[];
}

export interface ImageSetDecision {
   deletedImages: string[];
   completed: boolean;
}

export type Decisions = Record<string, ImageSetDecision>;

export interface PatchPreview {
   totalDeletes: number;
   totalKeptImages: number;
   completedImageSets: number;
   deleteBytes: number;
}

export interface PatchMove {
   groupId: string;
   file: string;
   from: string;
   to: string;
}

export interface PatchResult {
   moved: PatchMove[];
   skipped: PatchMove[];
   errors: (PatchMove & { message: string })[];
}

export interface LoadDataResult {
   groups: ImageSet[];
   decisions: Decisions;
   scanRoot: string | null;
   duplicateFolderPath: string | null;
   currentGroupId: string | null;
   duplicateFolderHasContent: boolean;
   lastFileAction: FileActionStatus;
   scanWarningCount: number;
}

export interface ScanRequest {
   rootPath: string;
}

export interface ScanProgress {
   phase: "discovering" | "hashing" | "grouping" | "saving";
   completed: number;
   total: number;
   currentFile?: string;
}

export interface AppApi {
   loadData: () => Promise<LoadDataResult>;
   chooseFolder: () => Promise<string | null>;
   scanFolder: (request: ScanRequest) => Promise<LoadDataResult>;
   onScanProgress: (listener: (progress: ScanProgress) => void) => () => void;
   saveDecisions: (decisions: Decisions) => Promise<void>;
   saveCurrentGroup: (groupId: string) => Promise<void>;
   applyPatch: (decisions: Decisions) => Promise<PatchResult>;
   getDuplicateFolderStatus: () => Promise<boolean>;
   restoreDuplicateFolder: () => Promise<PatchResult>;
   trashDuplicateFolder: () => Promise<void>;
   openGroupFolder: (folderPath: string) => Promise<void>;
   showImage: (imagePath: string) => Promise<void>;
   openImage: (imagePath: string) => Promise<void>;
}
