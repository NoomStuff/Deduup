import type { Decisions, ImageSetDecision } from "./types.js";

type JsonObject = Record<string, unknown>;

export const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

export const normalizeDecision = (value: unknown): ImageSetDecision | null => {
   if (!isObject(value) || !Array.isArray(value["deletedImages"]) || typeof value["seen"] !== "boolean") {
      return null;
   }

   const deletedImages = [...new Set(value["deletedImages"].filter((item): item is string => typeof item === "string" && item.length > 0))];
   return { deletedImages, seen: value["seen"] };
};

export const normalizeDecisions = (value: unknown): Decisions => {
   if (!isObject(value)) {
      return {};
   }

   const decisions: Decisions = {};
   for (const [groupId, rawDecision] of Object.entries(value)) {
      const decision = normalizeDecision(rawDecision);
      if (decision !== null && groupId.length > 0) {
         decisions[groupId] = decision;
      }
   }

   return decisions;
};
