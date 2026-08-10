/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TrelloColor } from "../types";

// Section 11 color definitions
export const TRELLO_COLORS: Record<TrelloColor, string> = {
  green: "#61bd4f",
  yellow: "#f2d600",
  orange: "#ff9f1a",
  red: "#eb5a46",
  purple: "#c377e0",
  blue: "#0079bf",
  sky: "#00c2e0",
  lime: "#51e898",
  pink: "#ff78cb",
  black: "#344563"
};

export const LIGHT_COLORS: TrelloColor[] = ["green", "yellow", "orange", "sky", "lime", "pink"];

/**
 * Returns custom background and accessible text colors for Trello labels
 */
export function getPillStyles(color: TrelloColor) {
  const bgHex = TRELLO_COLORS[color] || "#0079bf";
  const isLight = LIGHT_COLORS.includes(color);
  const textColor = isLight ? "#172b4d" : "#ffffff";
  return {
    backgroundColor: bgHex,
    color: textColor
  };
}
