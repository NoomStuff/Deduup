import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import {
   ArrowLeft,
   Check,
   ChevronLeft,
   ChevronRight,
   Eraser,
   Flag,
   FolderOpen,
   HomeIcon,
   Image as ImageIcon,
   MousePointer2,
   Redo2,
   Search,
   Settings,
   Sparkles,
   Trash2,
   TriangleAlert,
   Undo2,
   X,
} from "lucide-react";
import type { Decisions, FileActionStatus, ImageSet, ImageSetDecision, ImageItem, PatchResult, ScanProgress } from "../shared/types.js";
import type { CompareState, ConfirmAction, ContextMenuKind, ContextMenuState, PatchView, TravelDirection } from "./appTypes.js";
import { CompareOverlay } from "./components/CompareOverlay.js";
import { FinalReview } from "./components/FinalReview.js";
import { ScanPanel, SettingsPanel } from "./components/SidePanels.js";
import { LoadingScreen, ScanningScreen, StartupScreen } from "./components/AppStatusScreens.js";
import { ImageCard } from "./components/ImageCard.js";
import { useDecisionHistory } from "./hooks/useDecisionHistory.js";
import { useTooltip } from "./hooks/useTooltip.js";
import {
   createConfirmAction,
   emptyImageSetDecision,
   getAnchoredPosition,
   getAutoPick,
   getButtonMenuPosition,
   getContextMenuSize,
   getDecision,
   getDeletedImagePaths,
   getDetectionNumber,
   getDuplicatePreview,
   getDroppedFolderPath,
   getFolderName,
   getFileWorkflowState,
   getImageDeleteState,
   getImageSetDecision,
   getImageSetLabel,
   getImageSetState,
   getMovePreview,
   getPatchPreview,
   getResumeIndex,
   getSimilarityBands,
   getSimilarityColor,
   getSimilarityLabel,
   setImageSetDecision,
} from "./reviewModel.js";
import "./styles.css";
import "./workflow.css";

const shortcutReservedTargetSelector = "input,textarea,select,[contenteditable='true']";
const startupPreferenceKey = "show-start-screen-on-startup";

const getStartupPreference = (): boolean => {
   try {
      return window.localStorage.getItem(startupPreferenceKey) !== "false";
   } catch {
      return true;
   }
};

const isShortcutReservedByTarget = (event: KeyboardEvent): boolean => {
   if (event.key === "Escape") {
      return false;
   }

   const isEditable = event.target instanceof HTMLElement && event.target.closest(shortcutReservedTargetSelector) !== null;
   if (!isEditable) {
      return false;
   }

   const key = event.key.toLowerCase();
   return !((event.ctrlKey || event.metaKey) && (key === "z" || key === "y"));
};

export const App = () => {
   const [groups, setGroups] = useState<ImageSet[]>([]);
   const {
      decisions,
      canUndo,
      canRedo,
      updateDecisions,
      replaceDecisions,
      clearHistory,
      undo: undoLastDecision,
      redo: redoLastDecision,
   } = useDecisionHistory();
   const [currentIndex, setCurrentIndex] = useState(0);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);
   const [comparePick, setComparePick] = useState<ImageItem | null>(null);
   const [compare, setCompare] = useState<CompareState | null>(null);
   const [view, setView] = useState<PatchView>("review");
   const [patchResult, setPatchResult] = useState<PatchResult | null>(null);
   const [isApplying, setIsApplying] = useState(false);
   const [isTrashingDuplicate, setIsTrashingDuplicate] = useState(false);
   const [isRestoringDuplicate, setIsRestoringDuplicate] = useState(false);
   const [duplicateFolderHasContent, setDuplicateFolderHasContent] = useState(false);
   const [lastFileAction, setLastFileAction] = useState<FileActionStatus>("idle");
   const [restoreResult, setRestoreResult] = useState<PatchResult | null>(null);
   const [travelDirection, setTravelDirection] = useState<TravelDirection>("idle");
   const [scanRoot, setScanRoot] = useState<string | null>(null);
   const [includeSubfolders, setIncludeSubfolders] = useState(true);
   const [isScanning, setIsScanning] = useState(false);
   const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
   const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
   const [isSettingsOpen, setIsSettingsOpen] = useState(false);
   const [isScanPanelOpen, setIsScanPanelOpen] = useState(false);
   const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
   const { tooltip, hideTooltip, getTooltipProps } = useTooltip();
   const [confirmMajorActions, setConfirmMajorActions] = useState(true);
   const [wrapImageShelf, setWrapImageShelf] = useState(true);
   const [showStartupOnLaunch, setShowStartupOnLaunch] = useState(getStartupPreference);
   const [isStartupOpen, setIsStartupOpen] = useState(getStartupPreference);
   const [filmstripEdges, setFilmstripEdges] = useState({ left: false, right: false });
   const filmstripRef = useRef<HTMLElement | null>(null);
   const filmstripTargetRef = useRef<number | null>(null);
   const filmstripAnimationRef = useRef<number | null>(null);
   const hasPositionedFilmstripRef = useRef(false);

   const currentGroup = groups[currentIndex] ?? null;
   const currentDecision = currentGroup === null ? emptyImageSetDecision() : getDecision(decisions, currentGroup.id);
   const patchPreview = useMemo(() => getPatchPreview(groups, decisions), [decisions, groups]);
   const movePreview = useMemo(() => getMovePreview(groups, decisions), [decisions, groups]);
   const duplicatePreview = useMemo(() => getDuplicatePreview(groups, decisions), [decisions, groups]);
   const fileWorkflow = useMemo(() => getFileWorkflowState(groups, decisions), [decisions, groups]);
   const similarityBands = useMemo(() => getSimilarityBands(groups), [groups]);
   const selectedImage = currentGroup?.images.find((image) => image.originalPath === selectedImagePath) ?? null;

   const startFilmstripAnimation = useCallback((): void => {
      if (filmstripAnimationRef.current !== null) return;

      const tick = (): void => {
         const filmstrip = filmstripRef.current;
         const target = filmstripTargetRef.current;
         if (filmstrip === null || target === null) {
            filmstripAnimationRef.current = null;
            return;
         }

         const distance = target - filmstrip.scrollLeft;
         if (Math.abs(distance) < 0.5) {
            filmstrip.scrollLeft = target;
            filmstripAnimationRef.current = null;
            return;
         }

         filmstrip.scrollLeft += distance * 0.22;
         filmstripAnimationRef.current = window.requestAnimationFrame(tick);
      };

      filmstripAnimationRef.current = window.requestAnimationFrame(tick);
   }, []);

   useEffect(() => {
      setPatchResult(null);
   }, [decisions]);

   useEffect(() => {
      const api = window.imageDeduplicator;
      if (api === undefined) {
         setError("Open the Electron app to scan and review files.");
         setLoading(false);
         return;
      }

      api.loadData()
         .then((result) => {
            setGroups(result.groups);
            replaceDecisions(result.decisions);
            setScanRoot(result.scanRoot);
            setIncludeSubfolders(result.scanRoot === null ? true : result.includeSubfolders);
            setCurrentIndex(getResumeIndex(result.groups, result.decisions));
            setDuplicateFolderHasContent(result.duplicateFolderHasContent);
            setLastFileAction(result.lastFileAction);
         })
         .catch((unknownError: unknown) => setError(unknownError instanceof Error ? unknownError.message : "Failed to load duplicate groups"))
         .finally(() => setLoading(false));
   }, [replaceDecisions]);

   useEffect(() => {
      const api = window.imageDeduplicator;
      if (api === undefined) {
         return undefined;
      }

      return api.onScanProgress(setScanProgress);
   }, []);

   useEffect(() => {
      const api = window.imageDeduplicator;
      if (api === undefined || loading) {
         return undefined;
      }

      const timeout = window.setTimeout(() => {
         void api.saveDecisions(decisions).catch((unknownError: unknown) => {
            setError(unknownError instanceof Error ? unknownError.message : "Failed to save choices");
         });
      }, 100);

      return () => window.clearTimeout(timeout);
   }, [decisions, loading]);

   useEffect(() => {
      if (currentGroup === null) {
         setSelectedImagePath(null);
         return;
      }

      if (selectedImagePath !== null && !currentGroup.images.some((image) => image.originalPath === selectedImagePath)) {
         setSelectedImagePath(null);
      }
   }, [currentGroup, selectedImagePath]);

   useEffect(() => {
      hasPositionedFilmstripRef.current = false;
      filmstripTargetRef.current = null;
      if (filmstripAnimationRef.current !== null) {
         window.cancelAnimationFrame(filmstripAnimationRef.current);
         filmstripAnimationRef.current = null;
      }
   }, [groups]);

   useEffect(() => {
      const filmstrip = filmstripRef.current;
      if (filmstrip === null || view !== "review") {
         return;
      }

      const handle = window.requestAnimationFrame(() => {
         const active = filmstrip.querySelector<HTMLElement>(".filmstrip__item--active");
         if (active === null) {
            return;
         }

         const filmstripRect = filmstrip.getBoundingClientRect();
         const activeRect = active.getBoundingClientRect();
         const activeCenter = activeRect.left - filmstripRect.left + filmstrip.scrollLeft + activeRect.width / 2;
         const targetLeft = activeCenter - filmstrip.clientWidth / 2;
         const maxLeft = filmstrip.scrollWidth - filmstrip.clientWidth;
         const nextLeft = Math.max(0, Math.min(maxLeft, targetLeft));
         filmstripTargetRef.current = nextLeft;
         if (!hasPositionedFilmstripRef.current) {
            filmstrip.scrollLeft = nextLeft;
            hasPositionedFilmstripRef.current = true;
            return;
         }
         startFilmstripAnimation();
      });

      return () => window.cancelAnimationFrame(handle);
   }, [currentIndex, groups.length, isScanning, isStartupOpen, loading, startFilmstripAnimation, view]);

   useEffect(
      () => () => {
         if (filmstripAnimationRef.current !== null) window.cancelAnimationFrame(filmstripAnimationRef.current);
      },
      []
   );

   useEffect(() => {
      const filmstrip = filmstripRef.current;
      if (filmstrip === null || view !== "review") {
         return undefined;
      }

      const updateEdges = (): void => {
         const maxScroll = Math.max(0, filmstrip.scrollWidth - filmstrip.clientWidth);
         const left = filmstrip.scrollLeft > 2;
         const right = filmstrip.scrollLeft < maxScroll - 2;
         setFilmstripEdges((current) => (current.left === left && current.right === right ? current : { left, right }));
      };

      const frame = window.requestAnimationFrame(updateEdges);
      filmstrip.addEventListener("scroll", updateEdges, { passive: true });
      window.addEventListener("resize", updateEdges);
      return () => {
         window.cancelAnimationFrame(frame);
         filmstrip.removeEventListener("scroll", updateEdges);
         window.removeEventListener("resize", updateEdges);
      };
   }, [groups, isScanning, isStartupOpen, loading, view]);

   const goTo = useCallback(
      (index: number): void => {
         const nextIndex = Math.max(0, Math.min(groups.length - 1, index));
         if (nextIndex === currentIndex) {
            return;
         }

         setTravelDirection(nextIndex > currentIndex ? "right" : "left");
         setCompare(null);
         setComparePick(null);
         setSelectedImagePath(null);
         setCurrentIndex(nextIndex);
         window.setTimeout(() => setTravelDirection("idle"), 180);
      },
      [currentIndex, groups]
   );

   const goToAdjacentSimilarityBand = useCallback(
      (direction: -1 | 1): void => {
         const currentBandIndex = similarityBands.findIndex((band) => band.groups.some((group) => group.index === currentIndex));
         const targetBand = similarityBands[currentBandIndex + direction];
         if (targetBand === undefined) {
            return;
         }

         let nearestIndex = targetBand.groups[0]?.index ?? null;
         for (const candidate of targetBand.groups) {
            if (nearestIndex === null || Math.abs(candidate.index - currentIndex) < Math.abs(nearestIndex - currentIndex)) {
               nearestIndex = candidate.index;
            }
         }

         if (nearestIndex !== null) {
            goTo(nearestIndex);
         }
      },
      [currentIndex, goTo, similarityBands]
   );

   const decide = (imageSet: ImageSet, decision: ImageSetDecision): void => {
      updateDecisions((existing) => setImageSetDecision(existing, imageSet.id, decision));
   };

   const getAvailableImagesDecision = (imageSet: ImageSet, source: Decisions, markAvailableForDeletion: boolean): ImageSetDecision => {
      const deletedPaths = getDeletedImagePaths(getDecision(source, imageSet.id));
      for (const image of imageSet.images) {
         if (image.sourceStatus !== "available") {
            continue;
         }
         if (markAvailableForDeletion) {
            deletedPaths.add(image.originalPath);
         } else {
            deletedPaths.delete(image.originalPath);
         }
      }
      return getImageSetDecision(imageSet, deletedPaths, true);
   };

   const getClearedAvailableDecision = (imageSet: ImageSet, source: Decisions): ImageSetDecision => {
      const deletedPaths = getDeletedImagePaths(getDecision(source, imageSet.id));
      for (const image of imageSet.images) {
         if (image.sourceStatus === "available") {
            deletedPaths.delete(image.originalPath);
         }
      }
      return getImageSetDecision(imageSet, deletedPaths, false);
   };

   const advanceFromImageSet = (imageSet: ImageSet): void => {
      const groupIndex = groups.findIndex((item) => item.id === imageSet.id);
      window.requestAnimationFrame(() => goTo(groupIndex < 0 ? currentIndex + 1 : groupIndex + 1));
   };

   const updateImageSetDeletedPaths = (imageSet: ImageSet, getNextDeletedPaths: (existing: Set<string>) => Set<string>, advanceAfterChoice: boolean): void => {
      const decision = getDecision(decisions, imageSet.id);
      const nextDeletedPaths = getNextDeletedPaths(getDeletedImagePaths(decision));
      decide(imageSet, getImageSetDecision(imageSet, nextDeletedPaths, true));
      if (advanceAfterChoice) {
         advanceFromImageSet(imageSet);
      }
   };

   const toggleImageDeletion = (imageSet: ImageSet, image: ImageItem, advanceAfterChoice: boolean): void => {
      if (image.sourceStatus !== "available") {
         return;
      }

      updateImageSetDeletedPaths(
         imageSet,
         (existing) => {
            const next = new Set(existing);
            if (next.has(image.originalPath)) {
               next.delete(image.originalPath);
            } else {
               next.add(image.originalPath);
            }
            return next;
         },
         advanceAfterChoice
      );
   };

   const toggleOnlyImageKept = (imageSet: ImageSet, image: ImageItem, advanceAfterChoice: boolean): void => {
      if (image.sourceStatus !== "available") {
         return;
      }

      updateImageSetDeletedPaths(
         imageSet,
         (existing) => {
            const mutableImages = imageSet.images.filter((item) => item.sourceStatus === "available");
            const otherMutablePaths = mutableImages.map((item) => item.originalPath).filter((path) => path !== image.originalPath);
            const onlyThisImageIsKept = !existing.has(image.originalPath) && otherMutablePaths.every((path) => existing.has(path));
            const next = new Set(existing);
            for (const mutableImage of mutableImages) {
               if (onlyThisImageIsKept || mutableImage.originalPath === image.originalPath) {
                  next.delete(mutableImage.originalPath);
               } else {
                  next.add(mutableImage.originalPath);
               }
            }
            return next;
         },
         advanceAfterChoice
      );
   };

   const markImageSetCompleted = (imageSet: ImageSet): void => {
      decide(imageSet, getAvailableImagesDecision(imageSet, decisions, false));
   };

   const clearImageSetChoices = (imageSet: ImageSet): void => {
      updateDecisions((existing) => setImageSetDecision(existing, imageSet.id, getClearedAvailableDecision(imageSet, existing)));
   };

   const deleteImageSet = (imageSet: ImageSet): void => {
      decide(imageSet, getAvailableImagesDecision(imageSet, decisions, true));
   };

   const requestDeleteImageSet = (imageSet: ImageSet): void => {
      if (confirmMajorActions) {
         setConfirmAction({ ...createConfirmAction("deleteAll"), groupId: imageSet.id });
         return;
      }
      deleteImageSet(imageSet);
   };

   const markSimilarityGroupCompleted = (baseGroup: ImageSet): void => {
      const similarity = getSimilarityLabel(baseGroup.similarity);
      updateDecisions((existing) => {
         let next = existing;
         for (const imageSet of groups) {
            if (getSimilarityLabel(imageSet.similarity) === similarity) {
               next = setImageSetDecision(next, imageSet.id, getAvailableImagesDecision(imageSet, next, false));
            }
         }
         return next;
      });
   };

   const deleteSimilarityGroup = (baseGroup: ImageSet): void => {
      const similarity = getSimilarityLabel(baseGroup.similarity);
      updateDecisions((existing) => {
         let next = existing;
         for (const imageSet of groups) {
            if (getSimilarityLabel(imageSet.similarity) === similarity) {
               next = setImageSetDecision(next, imageSet.id, getAvailableImagesDecision(imageSet, next, true));
            }
         }
         return next;
      });
   };

   const clearSimilarityGroupChoices = (baseGroup: ImageSet): void => {
      const similarity = getSimilarityLabel(baseGroup.similarity);
      updateDecisions((existing) => {
         let next = existing;
         for (const imageSet of groups) {
            if (getSimilarityLabel(imageSet.similarity) === similarity) {
               next = setImageSetDecision(next, imageSet.id, getClearedAvailableDecision(imageSet, next));
            }
         }
         return next;
      });
   };

   const confirmClearAllDecisions = (): void => {
      updateDecisions((existing) => {
         let next = existing;
         for (const imageSet of groups) {
            next = setImageSetDecision(next, imageSet.id, getClearedAvailableDecision(imageSet, next));
         }
         return next;
      });
      setPatchResult(null);
      setCompare(null);
      setComparePick(null);
      setCurrentIndex(getResumeIndex(groups, {}));
   };

   const openCurrentGroupFolder = async (): Promise<void> => {
      if (currentGroup === null) {
         return;
      }

      const api = window.imageDeduplicator;
      if (api === undefined) {
         setError("Open the Electron app to use Explorer actions.");
         return;
      }

      try {
         await api.openGroupFolder(currentGroup.folderPath);
      } catch (unknownError: unknown) {
         setError(unknownError instanceof Error ? unknownError.message : "Failed to open the folder");
      }
   };

   const showImage = async (image: ImageItem): Promise<void> => {
      const api = window.imageDeduplicator;
      if (api === undefined) {
         setError("Open the Electron app to show files in Explorer.");
         return;
      }

      try {
         await api.showImage(image.originalPath);
      } catch (unknownError: unknown) {
         setError(unknownError instanceof Error ? unknownError.message : "Failed to show the image");
      }
   };

   const openImage = async (image: ImageItem): Promise<void> => {
      const api = window.imageDeduplicator;
      if (api === undefined) {
         setError("Open the Electron app to open images.");
         return;
      }

      try {
         await api.openImage(image.originalPath);
      } catch (unknownError: unknown) {
         setError(unknownError instanceof Error ? unknownError.message : "Failed to open the image");
      }
   };

   const getAutoSelectedDecision = (imageSet: ImageSet, source: Decisions): ImageSetDecision => {
      const availableImages = imageSet.images.filter((image) => image.sourceStatus === "available");
      if (availableImages.length === 0) {
         return getAvailableImagesDecision(imageSet, source, false);
      }

      const pick = getAutoPick({ ...imageSet, images: availableImages });
      const deletedPaths = getDeletedImagePaths(getDecision(source, imageSet.id));
      for (const image of availableImages) {
         if (image.originalPath === pick.originalPath) {
            deletedPaths.delete(image.originalPath);
         } else {
            deletedPaths.add(image.originalPath);
         }
      }
      return getImageSetDecision(imageSet, deletedPaths, true);
   };

   const autoCompleteSimilarityGroup = (baseGroup: ImageSet): void => {
      const similarity = getSimilarityLabel(baseGroup.similarity);
      const bandGroups = groups
         .map((imageSet, index) => ({ imageSet, index }))
         .filter(({ imageSet }) => getSimilarityLabel(imageSet.similarity) === similarity);
      const groupIdsToAutoPick = new Set(bandGroups.map(({ imageSet }) => imageSet.id));
      const lastBandIndex = bandGroups.at(-1)?.index ?? currentIndex;

      updateDecisions((existing) => {
         let next = existing;
         for (const imageSet of groups) {
            if (groupIdsToAutoPick.has(imageSet.id)) {
               next = setImageSetDecision(next, imageSet.id, getAutoSelectedDecision(imageSet, next));
            }
         }
         return next;
      });

      if (lastBandIndex >= currentIndex && lastBandIndex + 1 < groups.length) {
         window.setTimeout(() => goTo(lastBandIndex + 1), 80);
      }
   };

   const autoCompleteCurrentSimilarity = (): void => {
      if (currentGroup !== null) {
         autoCompleteSimilarityGroup(currentGroup);
      }
   };

   const autoCompleteImageSet = (imageSet: ImageSet): void => {
      decide(imageSet, getAutoSelectedDecision(imageSet, decisions));
   };

   const openContextMenu = (event: MouseEvent, kind: ContextMenuKind, image?: ImageItem, imageSet?: ImageSet): void => {
      event.preventDefault();
      event.stopPropagation();
      hideTooltip();
      if (image !== undefined) {
         setSelectedImagePath(image.originalPath);
      }
      const { width, height } = getContextMenuSize(kind);
      const position = getAnchoredPosition(event.clientX, event.clientY, width, height);
      setContextMenu({
         kind,
         ...position,
         ...(image === undefined ? {} : { imagePath: image.originalPath }),
         ...(imageSet === undefined ? {} : { groupId: imageSet.id }),
      });
   };

   const openContextMenuFromButton = (event: MouseEvent, kind: ContextMenuKind, imageSet?: ImageSet): void => {
      const rect = event.currentTarget.getBoundingClientRect();
      const { width, height } = getContextMenuSize(kind);
      const position = getButtonMenuPosition(rect, width, height);
      setContextMenu({ kind, ...position, ...(imageSet === undefined ? {} : { groupId: imageSet.id }) });
      hideTooltip();
   };

   const openImageContextMenuFromButton = (event: MouseEvent, image: ImageItem): void => {
      event.preventDefault();
      event.stopPropagation();
      if (currentGroup === null) {
         return;
      }

      hideTooltip();
      setSelectedImagePath(image.originalPath);
      const rect = event.currentTarget.getBoundingClientRect();
      const { width, height } = getContextMenuSize("image");
      const position = getButtonMenuPosition(rect, width, height);
      setContextMenu({ kind: "image", imagePath: image.originalPath, groupId: currentGroup.id, ...position });
   };

   const openImageSetContextMenu = (event: MouseEvent, imageSet: ImageSet): void => {
      openContextMenu(event, "imageSet", undefined, imageSet);
   };

   const getImageIndex = (image: ImageItem): number => currentGroup?.images.findIndex((item) => item.originalPath === image.originalPath) ?? -1;

   const openAdjacentCompare = (image: ImageItem): void => {
      if (currentGroup === null || image.sourceStatus !== "available") {
         return;
      }

      const imageIndex = getImageIndex(image);
      const adjacentImage =
         currentGroup.images.slice(imageIndex + 1).find((candidate) => candidate.sourceStatus === "available") ??
         currentGroup.images
            .slice(0, imageIndex)
            .reverse()
            .find((candidate) => candidate.sourceStatus === "available");
      if (adjacentImage === undefined) {
         return;
      }

      setCompare({ left: image, right: adjacentImage, leftIndex: imageIndex, rightIndex: getImageIndex(adjacentImage), reveal: 0.5 });
      setComparePick(null);
   };

   const beginCompare = (image: ImageItem): void => {
      if (currentGroup === null || image.sourceStatus !== "available") {
         return;
      }

      if (comparePick === null) {
         setComparePick(image);
         return;
      }

      if (comparePick.originalPath !== image.originalPath) {
         setCompare({ left: comparePick, right: image, leftIndex: getImageIndex(comparePick), rightIndex: getImageIndex(image), reveal: 0.5 });
         setComparePick(null);
      }
   };

   const handleImageClick = (event: MouseEvent, image: ImageItem): void => {
      setSelectedImagePath(image.originalPath);
      if (currentGroup === null) {
         return;
      }

      if (comparePick !== null && comparePick.originalPath !== image.originalPath) {
         beginCompare(image);
         return;
      }

      if (event.altKey) {
         event.preventDefault();
         beginCompare(image);
         return;
      }

      if (event.shiftKey) {
         toggleImageDeletion(currentGroup, image, event.ctrlKey);
         return;
      }
   };

   const handleContextMenu = (event: MouseEvent, image: ImageItem): void => {
      if (currentGroup === null) {
         return;
      }

      if (event.altKey) {
         event.preventDefault();
         openAdjacentCompare(image);
         return;
      }

      if (event.shiftKey) {
         event.preventDefault();
         toggleOnlyImageKept(currentGroup, image, event.ctrlKey);
         return;
      }

      openContextMenu(event, "image", image, currentGroup);
   };

   const handleImageDeleteToggle = (event: MouseEvent, image: ImageItem): void => {
      event.preventDefault();
      event.stopPropagation();
      if (currentGroup !== null) {
         setSelectedImagePath(image.originalPath);
         toggleImageDeletion(currentGroup, image, event.ctrlKey);
      }
   };

   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent): void => {
         if (event.key === "Escape") {
            if (contextMenu !== null) {
               setContextMenu(null);
               return;
            }

            if (confirmAction !== null) {
               setConfirmAction(null);
               return;
            }

            setCompare(null);
            setComparePick(null);
            setIsSettingsOpen(false);
            setIsScanPanelOpen(false);
            return;
         }

         if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "z") {
            event.preventDefault();
            redoLastDecision();
            return;
         }

         if (event.ctrlKey && event.key.toLowerCase() === "y") {
            event.preventDefault();
            redoLastDecision();
            return;
         }

         if (event.ctrlKey && event.key.toLowerCase() === "z") {
            event.preventDefault();
            undoLastDecision();
            return;
         }

         if (isShortcutReservedByTarget(event)) {
            return;
         }

         if (isStartupOpen || isSettingsOpen || isScanPanelOpen || contextMenu !== null || confirmAction !== null || view !== "review") {
            return;
         }

         if (compare !== null) {
            if (event.key === "ArrowLeft") {
               event.preventDefault();
               if (currentGroup !== null) {
                  toggleOnlyImageKept(currentGroup, compare.left, true);
               }
               setCompare(null);
            } else if (event.key === "ArrowRight") {
               event.preventDefault();
               if (currentGroup !== null) {
                  toggleOnlyImageKept(currentGroup, compare.right, true);
               }
               setCompare(null);
            }
            return;
         }

         if (event.ctrlKey && event.key === "ArrowLeft") {
            event.preventDefault();
            goToAdjacentSimilarityBand(-1);
         } else if (event.ctrlKey && event.key === "ArrowRight") {
            event.preventDefault();
            goToAdjacentSimilarityBand(1);
         } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            goTo(currentIndex - 1);
         } else if (event.key === "ArrowRight" || event.key === " ") {
            event.preventDefault();
            goTo(currentIndex + 1);
         } else if (event.key.toLowerCase() === "a") {
            event.preventDefault();
            goTo(currentIndex - 1);
         } else if (event.key.toLowerCase() === "d") {
            event.preventDefault();
            goTo(currentIndex + 1);
         } else if (event.key.toLowerCase() === "i") {
            if (currentGroup !== null) {
               event.preventDefault();
               markImageSetCompleted(currentGroup);
            }
         } else if (event.key.toLowerCase() === "x") {
            if (currentGroup !== null) {
               event.preventDefault();
               requestDeleteImageSet(currentGroup);
            }
         } else if (event.key.toLowerCase() === "c") {
            if (currentGroup !== null) {
               event.preventDefault();
               markImageSetCompleted(currentGroup);
            }
         } else if (event.key.toLowerCase() === "u") {
            if (currentGroup !== null) {
               event.preventDefault();
               markSimilarityGroupCompleted(currentGroup);
            }
         } else if (event.key.toLowerCase() === "v") {
            event.preventDefault();
            autoCompleteCurrentSimilarity();
         } else if (event.key === "Enter" && currentGroup !== null) {
            event.preventDefault();
            markImageSetCompleted(currentGroup);
            if (event.ctrlKey) {
               advanceFromImageSet(currentGroup);
            }
         } else if ((event.key === "Delete" || event.key === "Backspace") && selectedImage !== null) {
            if (currentGroup !== null) {
               event.preventDefault();
               toggleImageDeletion(currentGroup, selectedImage, event.ctrlKey);
            }
         } else if (/^[1-9]$/u.test(event.key) && currentGroup !== null) {
            const image = currentGroup.images[Number.parseInt(event.key, 10) - 1];
            if (image !== undefined) {
               event.preventDefault();
               toggleImageDeletion(currentGroup, image, event.ctrlKey);
            }
         }
      };

      window.addEventListener("keydown", onKeyDown, { capture: true });
      return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
   });

   useEffect(() => {
      const onPointerDown = (): void => setContextMenu(null);
      window.addEventListener("pointerdown", onPointerDown);
      return () => window.removeEventListener("pointerdown", onPointerDown);
   }, []);

   useEffect(() => {
      const onMouseUp = (event: globalThis.MouseEvent): void => {
         if (event.button === 3) {
            event.preventDefault();
            goTo(currentIndex - 1);
         } else if (event.button === 4) {
            event.preventDefault();
            goTo(currentIndex + 1);
         }
      };

      window.addEventListener("mouseup", onMouseUp);
      return () => window.removeEventListener("mouseup", onMouseUp);
   }, [currentIndex, goTo]);

   const applyPatch = async (): Promise<void> => {
      const api = window.imageDeduplicator;
      if (api === undefined) {
         setError("Open the Electron app to move marked files.");
         return;
      }

      setIsApplying(true);
      setRestoreResult(null);
      try {
         const result = await api.applyPatch(decisions);
         setPatchResult(result);
         const refreshed = await api.loadData();
         setGroups(refreshed.groups);
         clearHistory();
         setDuplicateFolderHasContent(refreshed.duplicateFolderHasContent);
         setLastFileAction(refreshed.lastFileAction);
      } catch (unknownError: unknown) {
         setError(unknownError instanceof Error ? unknownError.message : "Failed to move marked files");
      } finally {
         setIsApplying(false);
      }
   };

   const trashDuplicateFolder = async (): Promise<void> => {
      const api = window.imageDeduplicator;
      if (api === undefined) {
         setError("Open the Electron app to move the duplicate folder to the Recycle Bin.");
         return;
      }

      setIsTrashingDuplicate(true);
      try {
         await api.trashDuplicateFolder();
         const refreshed = await api.loadData();
         setGroups(refreshed.groups);
         setDuplicateFolderHasContent(refreshed.duplicateFolderHasContent);
         setLastFileAction(refreshed.lastFileAction);
         setRestoreResult(null);
      } catch (unknownError: unknown) {
         setError(unknownError instanceof Error ? unknownError.message : "Failed to move the duplicate folder to the Recycle Bin");
      } finally {
         setIsTrashingDuplicate(false);
      }
   };

   const restoreDuplicateFolder = async (): Promise<void> => {
      const api = window.imageDeduplicator;
      if (api === undefined) {
         setError("Open the Electron app to restore moved files.");
         return;
      }

      setIsRestoringDuplicate(true);
      try {
         const result = await api.restoreDuplicateFolder();
         setRestoreResult(result);
         setPatchResult(null);
         const refreshed = await api.loadData();
         setGroups(refreshed.groups);
         setDuplicateFolderHasContent(refreshed.duplicateFolderHasContent);
         setLastFileAction(refreshed.lastFileAction);
      } catch (unknownError: unknown) {
         setError(unknownError instanceof Error ? unknownError.message : "Failed to restore moved files");
      } finally {
         setIsRestoringDuplicate(false);
      }
   };

   const chooseScanFolder = async (): Promise<string | null> => {
      const api = window.imageDeduplicator;
      if (api === undefined) {
         return null;
      }

      try {
         const selectedPath = await api.chooseFolder();
         if (selectedPath !== null) {
            setScanRoot(selectedPath);
            setError(null);
         }
         return selectedPath;
      } catch (unknownError: unknown) {
         setError(unknownError instanceof Error ? unknownError.message : "Failed to choose a folder");
         return null;
      }
   };

   const startScan = async (rootPath = scanRoot): Promise<void> => {
      const api = window.imageDeduplicator;
      if (api === undefined || rootPath === null) {
         return;
      }

      setScanRoot(rootPath);
      setIsScanning(true);
      setScanProgress({ phase: "discovering", completed: 0, total: 0 });
      setError(null);
      try {
         const result = await api.scanFolder({ rootPath, includeSubfolders });
         setGroups(result.groups);
         replaceDecisions(result.decisions);
         setCurrentIndex(0);
         setSelectedImagePath(result.groups[0]?.images[0]?.originalPath ?? null);
         setView("review");
         setPatchResult(null);
         setRestoreResult(null);
         setDuplicateFolderHasContent(result.duplicateFolderHasContent);
         setLastFileAction(result.lastFileAction);
      } catch (unknownError: unknown) {
         setError(unknownError instanceof Error ? unknownError.message : "Failed to scan the selected folder");
      } finally {
         setIsScanning(false);
      }
   };

   const openNewFolder = async (): Promise<void> => {
      const selectedPath = await chooseScanFolder();
      if (selectedPath === null) {
         return;
      }

      setIsStartupOpen(false);
      await startScan(selectedPath);
   };

   const updateStartupPreference = (checked: boolean): void => {
      setShowStartupOnLaunch(checked);
      try {
         window.localStorage.setItem(startupPreferenceKey, String(checked));
      } catch {
         // The screen remains usable if local preferences are unavailable.
      }
   };

   const handleDrop = (event: DragEvent): void => {
      event.preventDefault();
      const folderPath = getDroppedFolderPath(event);
      if (folderPath !== null) {
         setScanRoot(folderPath);
      }
   };

   const runConfirmAction = (): void => {
      if (confirmAction === null) {
         return;
      }

      const { kind } = confirmAction;
      setConfirmAction(null);
      if (kind === "deleteAll") {
         const targetGroup =
            confirmAction.groupId === undefined ? currentGroup : (groups.find((imageSet) => imageSet.id === confirmAction.groupId) ?? currentGroup);
         if (targetGroup !== null) {
            deleteImageSet(targetGroup);
         }
      } else if (kind === "clearAll") {
         confirmClearAllDecisions();
      } else {
         void trashDuplicateFolder();
      }
   };

   if (loading) {
      return <LoadingScreen />;
   }

   if (isScanning) {
      return <ScanningScreen progress={scanProgress} />;
   }

   if (isStartupOpen || currentGroup === null) {
      return (
         <StartupScreen
            canRescan={scanRoot !== null}
            canUseApp={window.imageDeduplicator !== undefined}
            hasSavedReview={groups.length > 0}
            onContinue={() => setIsStartupOpen(false)}
            onDrop={handleDrop}
            onOpenFolder={() => void openNewFolder()}
            onRescan={() => {
               setIsStartupOpen(false);
               void startScan();
            }}
            onShowOnLaunchChange={updateStartupPreference}
            showOnLaunch={showStartupOnLaunch}
         />
      );
   }

   const totalGroups = groups.length;
   const reviewedGroups = patchPreview.completedImageSets;
   const reviewProgress = totalGroups === 0 ? 0 : reviewedGroups / totalGroups;
   const reviewPercent = Math.round(reviewProgress * 100);
   const folderName = getFolderName(scanRoot);
   const duplicateDestination = scanRoot === null ? "base folder\\duplicate" : `${scanRoot}\\duplicate`;
   const contextImageSet = contextMenu?.groupId === undefined ? currentGroup : (groups.find((imageSet) => imageSet.id === contextMenu.groupId) ?? currentGroup);
   const contextImageSetDecision = getDecision(decisions, contextImageSet.id);
   const contextImage =
      contextMenu?.imagePath === undefined
         ? selectedImage
         : (contextImageSet.images.find((image) => image.originalPath === contextMenu.imagePath) ?? selectedImage);
   const contextDeletedPaths = getDeletedImagePaths(contextImageSetDecision);
   const contextImageIsDeleted = contextImage === null ? false : contextDeletedPaths.has(contextImage.originalPath);
   const contextOnlyImageKept =
      contextImage !== null &&
      !contextImageIsDeleted &&
      contextImageSet.images.every((image) => image.originalPath === contextImage.originalPath || contextDeletedPaths.has(image.originalPath));

   return (
      <main className={`shell${wrapImageShelf ? " shell--wrapShelf" : ""}`}>
         <header className="topbar">
            <div className="topbar__identity">
               <p className="sectionLabel">{folderName}</p>
               <h1>
                  {getDetectionNumber(currentGroup.id)}
                  <span>/{groups.length}</span>
               </h1>
            </div>
            <div className="topbar__actions">
               <button
                  className="iconButton"
                  disabled={!canUndo}
                  onClick={undoLastDecision}
                  type="button"
                  {...getTooltipProps("Undo", "Restore the previous review choice.", "Ctrl Z")}
               >
                  <Undo2 aria-hidden="true" />
               </button>
               <button
                  className="iconButton"
                  disabled={!canRedo}
                  onClick={redoLastDecision}
                  type="button"
                  {...getTooltipProps("Redo", "Reapply a choice you just undid.", "Ctrl Shift Z")}
               >
                  <Redo2 aria-hidden="true" />
               </button>
               <button
                  className="iconButton"
                  onClick={() => {
                     setIsSettingsOpen(false);
                     setIsScanPanelOpen(false);
                     setIsStartupOpen(true);
                  }}
                  type="button"
                  {...getTooltipProps("Start screen", "Choose a new folder, continue a review, or rescan.")}
               >
                  <HomeIcon aria-hidden="true" />
               </button>
               <button
                  className="iconButton"
                  onClick={() => {
                     setIsScanPanelOpen(false);
                     setIsSettingsOpen(true);
                  }}
                  type="button"
                  {...getTooltipProps("Settings", "Review behavior and confirmation preferences.")}
               >
                  <Settings aria-hidden="true" />
               </button>
               <button
                  className="finalStep"
                  onClick={() => setView(view === "review" ? "patch" : "review")}
                  type="button"
                  {...getTooltipProps(
                     view === "patch" ? "Back to selection" : "Final review",
                     view === "patch" ? "Return to the image sets without moving files." : "Review the files marked for deletion before anything is moved."
                  )}
               >
                  {view === "patch" ? <ArrowLeft aria-hidden="true" /> : <Flag aria-hidden="true" />} {view === "patch" ? "Back to selection" : "Final review"}
               </button>
            </div>
            <div className="topbar__progress" aria-label={`${reviewPercent}% reviewed`}>
               <span style={{ width: `${reviewPercent}%` }} />
            </div>
         </header>

         {error !== null && (
            <div className="appToast" role="alert">
               <TriangleAlert aria-hidden="true" />
               <span>{error}</span>
               <button aria-label="Dismiss error" className="iconButton" onClick={() => setError(null)} type="button">
                  <X aria-hidden="true" />
               </button>
            </div>
         )}

         {view === "review" ? (
            <>
               <section className={`reviewWorkspace imageGrid--${travelDirection}`}>
                  <div className="reviewWorkspace__main">
                     {comparePick !== null && (
                        <div className="comparePrompt">
                           <MousePointer2 aria-hidden="true" />
                           <span>Pick one more image to compare</span>
                           <kbd>Esc</kbd>
                        </div>
                     )}
                     <section className="imageShelf" aria-label="Images in current duplicate set">
                        {currentGroup.images.map((image, index) => (
                           <ImageCard
                              image={image}
                              index={index}
                              isComparePick={comparePick?.originalPath === image.originalPath}
                              isSelected={selectedImagePath === image.originalPath}
                              key={image.originalPath}
                              onBadgeClick={openImageContextMenuFromButton}
                              onClick={handleImageClick}
                              onContextMenu={handleContextMenu}
                              onToggleDelete={handleImageDeleteToggle}
                              state={getImageDeleteState(currentDecision, image)}
                           />
                        ))}
                     </section>
                  </div>
               </section>

               <section className="setTimeline">
                  <button
                     className="setNav setNav--compact"
                     onClick={() => goTo(currentIndex - 1)}
                     type="button"
                     {...getTooltipProps("Previous set", "Move to the previous image set.", "Left arrow")}
                  >
                     <ChevronLeft aria-hidden="true" />
                  </button>
                  <div
                     className={
                        "filmstripFrame" + (filmstripEdges.left ? " filmstripFrame--fadeLeft" : "") + (filmstripEdges.right ? " filmstripFrame--fadeRight" : "")
                     }
                  >
                     <section aria-label="Detection groups" className="filmstrip" ref={filmstripRef}>
                        {similarityBands.map((band) => {
                           const bandSimilarity = band.groups[0]?.imageSet.similarity ?? 0;
                           return (
                              <div className="similarityBand" key={band.label} style={{ "--band-color": getSimilarityColor(bandSimilarity) } as CSSProperties}>
                                 <button
                                    className="similarityBand__tag"
                                    onClick={(event) => openContextMenuFromButton(event, "similarityGroup", band.groups[0]?.imageSet)}
                                    onContextMenu={(event) => openContextMenu(event, "similarityGroup", undefined, band.groups[0]?.imageSet)}
                                    type="button"
                                 >
                                    {band.label}
                                 </button>
                                 <div className="similarityBand__items">
                                    {band.groups.map(({ imageSet, index }) => {
                                       const decision = getDecision(decisions, imageSet.id);
                                       const state = getImageSetState(imageSet, decisions[imageSet.id]);
                                       return (
                                          <button
                                             className={
                                                imageSet.id === currentGroup.id
                                                   ? `filmstrip__item filmstrip__item--active filmstrip__item--${state}`
                                                   : `filmstrip__item filmstrip__item--${state}`
                                             }
                                             key={imageSet.id}
                                             onClick={() => goTo(index)}
                                             onContextMenu={(event) => openImageSetContextMenu(event, imageSet)}
                                             title={`${imageSet.id} / similarity ${imageSet.similarity.toFixed(2)}`}
                                             type="button"
                                          >
                                             <span>{getDetectionNumber(imageSet.id)}</span>
                                             <small>{getImageSetLabel(imageSet, decision)}</small>
                                          </button>
                                       );
                                    })}
                                 </div>
                              </div>
                           );
                        })}
                     </section>
                  </div>
                  <button
                     className="setNav setNav--compact"
                     onClick={() => goTo(currentIndex + 1)}
                     type="button"
                     {...getTooltipProps("Next set", "Move to the next image set.", "Right arrow")}
                  >
                     <ChevronRight aria-hidden="true" />
                  </button>
               </section>
            </>
         ) : (
            <FinalReview
               destination={duplicateDestination}
               duplicateFolderHasContent={duplicateFolderHasContent}
               duplicatePreview={duplicatePreview}
               getTooltipProps={getTooltipProps}
               isApplying={isApplying}
               isRestoring={isRestoringDuplicate}
               isTrashing={isTrashingDuplicate}
               lastFileAction={lastFileAction}
               movePreview={movePreview}
               onApply={() => void applyPatch()}
               onOpenFolder={() => void openCurrentGroupFolder()}
               onRestore={() => void restoreDuplicateFolder()}
               onTrash={() => (confirmMajorActions ? setConfirmAction(createConfirmAction("trashDuplicate")) : void trashDuplicateFolder())}
               patchResult={patchResult}
               restoreResult={restoreResult}
               workflow={fileWorkflow}
            />
         )}

         {isSettingsOpen && (
            <SettingsPanel
               confirmMajorActions={confirmMajorActions}
               onClear={() => setConfirmAction(createConfirmAction("clearAll"))}
               onClose={() => setIsSettingsOpen(false)}
               onConfirmChange={setConfirmMajorActions}
               onStartupChange={updateStartupPreference}
               onWrapChange={setWrapImageShelf}
               showStartupOnLaunch={showStartupOnLaunch}
               wrapImageShelf={wrapImageShelf}
            />
         )}

         {isScanPanelOpen && (
            <ScanPanel
               includeSubfolders={includeSubfolders}
               onChooseFolder={() => void chooseScanFolder()}
               onClear={() => setConfirmAction(createConfirmAction("clearAll"))}
               onClose={() => setIsScanPanelOpen(false)}
               onIncludeSubfoldersChange={setIncludeSubfolders}
               onRescan={() => void startScan()}
               scanRoot={scanRoot}
            />
         )}

         {contextMenu !== null && (
            <div className="contextMenu" onPointerDown={(event) => event.stopPropagation()} style={{ left: contextMenu.x, top: contextMenu.y }}>
               {contextMenu.kind === "image" && contextImage !== null && (
                  <>
                     <button
                        className="contextMenu__command contextMenu__command--danger contextMenu__command--important"
                        disabled={contextImage.sourceStatus !== "available"}
                        onClick={() => {
                           toggleImageDeletion(contextImageSet, contextImage, false);
                           setContextMenu(null);
                        }}
                        type="button"
                     >
                        <Trash2 aria-hidden="true" />
                        <span>{contextImageIsDeleted ? "Restore image" : "Mark for deletion"}</span>
                        <kbd>Shift LMB</kbd>
                     </button>
                     <button
                        className="contextMenu__command contextMenu__command--danger contextMenu__command--important"
                        disabled={contextImage.sourceStatus !== "available"}
                        onClick={() => {
                           toggleOnlyImageKept(contextImageSet, contextImage, false);
                           setContextMenu(null);
                        }}
                        type="button"
                     >
                        <Trash2 aria-hidden="true" />
                        <span>{contextOnlyImageKept ? "Restore other images" : "Mark others for deletion"}</span>
                        <kbd>Shift RMB</kbd>
                     </button>
                     <div className="contextMenu__divider" />
                     <button
                        className="contextMenu__command contextMenu__command--accent"
                        disabled={contextImage.sourceStatus !== "available"}
                        onClick={() => {
                           beginCompare(contextImage);
                           setContextMenu(null);
                        }}
                        type="button"
                     >
                        <Search aria-hidden="true" />
                        <span>Compare to...</span>
                        <kbd>Alt LMB</kbd>
                     </button>
                     <div className="contextMenu__divider" />
                     <button
                        className="contextMenu__command"
                        onClick={() => {
                           void showImage(contextImage);
                           setContextMenu(null);
                        }}
                        type="button"
                     >
                        <FolderOpen aria-hidden="true" />
                        <span>Open in folder</span>
                     </button>
                     <button
                        className="contextMenu__command"
                        onClick={() => {
                           void openImage(contextImage);
                           setContextMenu(null);
                        }}
                        type="button"
                     >
                        <ImageIcon aria-hidden="true" />
                        <span>Open image</span>
                     </button>
                  </>
               )}
               {contextMenu.kind === "imageSet" && (
                  <>
                     <button
                        className="contextMenu__command contextMenu__command--danger contextMenu__command--important"
                        onClick={() => {
                           requestDeleteImageSet(contextImageSet);
                           setContextMenu(null);
                        }}
                        type="button"
                     >
                        <Trash2 aria-hidden="true" />
                        <span>Mark whole set for deletion</span>
                        <kbd>X</kbd>
                     </button>
                     <button
                        className="contextMenu__command contextMenu__command--success contextMenu__command--important"
                        onClick={() => {
                           markImageSetCompleted(contextImageSet);
                           setContextMenu(null);
                        }}
                        type="button"
                     >
                        <Check aria-hidden="true" />
                        <span>Mark whole set as kept</span>
                        <kbd>Enter</kbd>
                     </button>
                     <div className="contextMenu__divider" />
                     <button
                        className="contextMenu__command contextMenu__command--accent"
                        onClick={() => {
                           autoCompleteImageSet(contextImageSet);
                           setContextMenu(null);
                        }}
                        type="button"
                     >
                        <Sparkles aria-hidden="true" />
                        <span>Autoselect 1 image this set</span>
                     </button>
                     <button
                        className="contextMenu__command"
                        onClick={() => {
                           clearImageSetChoices(contextImageSet);
                           setContextMenu(null);
                        }}
                        type="button"
                     >
                        <Eraser aria-hidden="true" />
                        <span>Clear choices</span>
                     </button>
                  </>
               )}
               {contextMenu.kind === "similarityGroup" && (
                  <>
                     <button
                        className="contextMenu__command contextMenu__command--danger contextMenu__command--important"
                        onClick={() => {
                           deleteSimilarityGroup(contextImageSet);
                           setContextMenu(null);
                        }}
                        type="button"
                     >
                        <Trash2 aria-hidden="true" />
                        <span>Mark entire group for deletion</span>
                     </button>
                     <button
                        className="contextMenu__command contextMenu__command--success contextMenu__command--important"
                        onClick={() => {
                           markSimilarityGroupCompleted(contextImageSet);
                           setContextMenu(null);
                        }}
                        type="button"
                     >
                        <Check aria-hidden="true" />
                        <span>Mark entire group as kept</span>
                        <kbd>U</kbd>
                     </button>
                     <div className="contextMenu__divider" />
                     <button
                        className="contextMenu__command contextMenu__command--accent"
                        onClick={() => {
                           autoCompleteSimilarityGroup(contextImageSet);
                           setContextMenu(null);
                        }}
                        type="button"
                     >
                        <Sparkles aria-hidden="true" />
                        <span>Autoselect 1 image for all sets</span>
                        <kbd>V</kbd>
                     </button>
                     <button
                        className="contextMenu__command"
                        onClick={() => {
                           clearSimilarityGroupChoices(contextImageSet);
                           setContextMenu(null);
                        }}
                        type="button"
                     >
                        <Eraser aria-hidden="true" />
                        <span>Clear choices</span>
                     </button>
                  </>
               )}
            </div>
         )}

         {tooltip !== null && (
            <div className={`tooltipBubble tooltipBubble--${tooltip.placement}`} style={{ left: tooltip.x, top: tooltip.y }} role="tooltip">
               <strong>{tooltip.title}</strong>
               <span>{tooltip.body}</span>
               {tooltip.hotkey !== undefined && <kbd>{tooltip.hotkey}</kbd>}
            </div>
         )}

         {confirmAction !== null && (
            <div className="confirmOverlay" role="presentation">
               <section aria-labelledby="confirm-title" aria-modal="true" className="confirmDialog" role="dialog">
                  <div className="confirmDialog__icon" aria-hidden="true">
                     <TriangleAlert />
                  </div>
                  <div className="confirmDialog__content">
                     <p className="sectionLabel">Confirm</p>
                     <h2 id="confirm-title">{confirmAction.title}</h2>
                     <p>{confirmAction.body}</p>
                  </div>
                  <div className="confirmDialog__actions">
                     <button onClick={() => setConfirmAction(null)} type="button">
                        Cancel
                     </button>
                     <button className="danger" onClick={runConfirmAction} type="button">
                        <TriangleAlert aria-hidden="true" /> {confirmAction.confirmLabel}
                     </button>
                  </div>
               </section>
            </div>
         )}

         {compare !== null && (
            <CompareOverlay
               compare={compare}
               onClose={() => setCompare(null)}
               onKeep={(image) => {
                  toggleOnlyImageKept(currentGroup, image, false);
                  setCompare(null);
               }}
            />
         )}
      </main>
   );
};

createRoot(document.querySelector("#root") ?? document.body).render(<App />);
