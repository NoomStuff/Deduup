export interface ImageItem {
   file: string;
   originalPath: string;
   currentPath: string;
   folderPath: string;
   hash: string;
   width: number;
   height: number;
   size: number;
   modifiedAt: number;
   changedAt: number;
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
}

export type Decisions = Record<string, ImageSetDecision>;

export interface PlannedMove {
   setId: string;
   file: string;
   from: string;
   to: string;
   expectedSource?: { size: number; modifiedAt: number; changedAt?: number };
}

export interface MoveResult {
   moved: PlannedMove[];
   skipped: PlannedMove[];
   errors: (PlannedMove & { message: string })[];
}

export interface LoadDataResult {
   scanId: string;
   groups: ImageSet[];
   decisions: Decisions;
   scanRoot: string | null;
   duplicateFolderPath: string | null;
   currentSetId: string | null;
   duplicateFolderHasContent: boolean;
   lastFileAction: FileActionStatus;
   scanWarningCount: number;
   /** Up to five example paths for skipped items; scanWarningCount is the full total. */
   scanWarningPaths: string[];
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

export type WindowAction = "minimize" | "maximize" | "close";

export interface AppApi {
   windowAction: (action: WindowAction) => Promise<void>;
   loadData: () => Promise<LoadDataResult>;
   chooseFolder: () => Promise<string | null>;
   scanFolder: (request: ScanRequest) => Promise<LoadDataResult>;
   cancelScan: () => Promise<void>;
   onScanProgress: (listener: (progress: ScanProgress) => void) => () => void;
   onScanComplete: (listener: (result: LoadDataResult) => void) => () => void;
   onAppError: (listener: (message: string) => void) => () => void;
   onLibraryUpdate: (listener: (result: LoadDataResult) => void) => () => void;
   onLibraryError: (listener: (message: string) => void) => () => void;
   setReviewBusy: (busy: boolean) => Promise<void>;
   saveDecisions: (decisions: Decisions, scanId: string) => Promise<void>;
   saveCurrentSet: (setId: string, scanId: string) => Promise<void>;
   applyMoves: (decisions: Decisions, scanId: string) => Promise<MoveResult>;
   getDuplicateFolderStatus: () => Promise<boolean>;
   restoreDuplicateFolder: () => Promise<MoveResult>;
   trashDuplicateFolder: () => Promise<void>;
   openSetFolder: (folderPath: string) => Promise<void>;
   showImage: (imagePath: string) => Promise<void>;
   openImage: (imagePath: string) => Promise<void>;
   getPathForFile: (file: File) => string;
}
