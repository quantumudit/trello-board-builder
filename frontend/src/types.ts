/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// The 10 colors Trello accepts. No others are valid.
export type TrelloColor =
  | "green" | "yellow" | "orange" | "red" | "purple"
  | "blue" | "sky" | "lime" | "pink" | "black";

export interface TrelloColorSwatch {
  name: TrelloColor;
  hex: string;
}

// A single card as it appears in the input JSON and in the preview.
export interface Card {
  list_name: string;
  card_title: string;
  description: string;
  labels: string[];           // label names, e.g. ["Low", "High"]
  start_date?: string | null; // ISO 8601 date string (YYYY-MM-DD) or null
  due_date: string | null;    // ISO 8601 date string (YYYY-MM-DD) or null
  checklist: {
    title: string;
    items: string[];
  } | null;
}

// A label with its assigned color (user-configurable).
export interface LabelWithColor {
  name: string;
  color: TrelloColor;
}

// Board-level configuration submitted at build time.
export interface BoardConfig {
  board_name: string;
  board_description: string;
  permission_level: "private" | "org" | "public";
  create_if_not_exists: boolean;
}

// Full build request body sent to POST /api/build.
export interface BuildRequest {
  api_key: string;
  token: string;
  board_name: string;
  board_description: string;
  permission_level: "private" | "org" | "public";
  create_if_not_exists: boolean;
  lists: string[];
  labels: { name: string; color: TrelloColor }[];
  cards: Card[];
}

export type LogLevel = "INFO" | "SUCCESS" | "ERROR" | "WARNING";

export interface LogLine {
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface AppState {
  step: 1 | 2 | 3 | 4;

  // Step 1 / 2
  rawCards: Card[];                    // mutated in Step 2 editor
  validationResult: {
    card_count: number;
    labels: { name: string; default_color: TrelloColor }[];
    lists: string[];
  } | null;

  // Step 3
  labelColors: Record<string, TrelloColor>;   // label name -> chosen color
  boardName: string;
  boardDescription: string;
  permissionLevel: "private" | "org" | "public";
  createIfNotExists: boolean;
  apiKey: string;
  token: string;

  // Step 4
  jobId: string | null;
  logLines: LogLine[];
  buildStatus: "idle" | "running" | "success" | "error";
  boardUrl: string | null;
  buildError: string | null;
}

export type AppAction =
  | { type: "SET_STEP"; payload: 1 | 2 | 3 | 4 }
  | { type: "LOAD_CARDS"; payload: { cards: Card[]; lists: string[]; labels: { name: string; default_color: TrelloColor }[] } }
  | { type: "UPDATE_CARDS"; payload: Card[] }
  | { type: "UPDATE_LABEL_COLOR"; payload: { name: string; color: TrelloColor } }
  | { type: "RESET_BOARD" }
  | { type: "SET_BOARD_FIELD"; payload: { name: keyof AppState; value: any } }
  | { type: "SET_BUILD_JOB"; payload: { jobId: string; status: "running" } }
  | { type: "ADD_LOG_LINE"; payload: LogLine }
  | { type: "SET_BUILD_SUCCESS"; payload: { boardUrl: string } }
  | { type: "SET_BUILD_ERROR"; payload: { message: string } };
