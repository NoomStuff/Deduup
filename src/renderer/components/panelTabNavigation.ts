import type { KeyboardEvent } from "react";

/** Shared automatic tab activation, preserving each panel's click behavior. */
export const navigatePanelTabs = (event: KeyboardEvent<HTMLDivElement>): void => {
   if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
   const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
   const index = tabs.findIndex((tab) => tab === document.activeElement);
   if (index < 0 || tabs.length === 0) return;
   event.preventDefault();
   const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + tabs.length) % tabs.length;
   tabs[next]?.focus();
   tabs[next]?.click();
};
