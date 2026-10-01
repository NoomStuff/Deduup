import type { Decisions } from "./types.js";

type JsonObject = Record<string, unknown>;

export const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

/** Mutation payloads must be complete and valid; silently dropping entries could clear saved choices. */
export const parseDecisions = (value: unknown): Decisions => {
   if (!isObject(value)) throw new TypeError("Invalid review choices");
   const decisions: Decisions = {};
   for (const [setId, raw] of Object.entries(value)) {
      if (setId.length === 0 || !isObject(raw) || !Array.isArray(raw["deletedImages"])) {
         throw new TypeError("Invalid review choices");
      }
      const paths: unknown[] = raw["deletedImages"];
      if (!paths.every((item): item is string => typeof item === "string" && item.length > 0)) throw new TypeError("Invalid removal candidates");
      Object.defineProperty(decisions, setId, { value: { deletedImages: [...new Set(paths)] }, enumerable: true });
   }
   return decisions;
};
