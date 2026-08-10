/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Card, TrelloColor, BuildRequest } from "../types";

export const USE_MOCK = false; // Toggle to false when connecting to the real FastAPI server

const SAMPLE_CARDS: Card[] = [
  {
    list_name: "Backlog",
    card_title: "Define project scope",
    description: "Write the initial scope document and get stakeholder sign-off.",
    labels: ["Low"],
    due_date: "2026-07-15",
    checklist: { title: "Tasks", items: ["Draft outline", "Get sign-off", "Publish to Confluence"] },
  },
  {
    list_name: "Backlog",
    card_title: "Set up repository",
    description: "Initialize Git repo with CI/CD pipeline and branch protection rules.",
    labels: ["Medium"],
    due_date: null,
    checklist: null,
  },
  {
    list_name: "To Do",
    card_title: "Design database schema",
    description: "",
    labels: ["High", "Medium"],
    due_date: "2026-07-20",
    checklist: { title: "Deliverables", items: ["ER diagram", "Migration script", "Index strategy doc"] },
  },
  {
    list_name: "To Do",
    card_title: "Write API contracts",
    description: "Define OpenAPI spec for all endpoints.",
    labels: ["Medium"],
    due_date: null,
    checklist: null,
  },
  {
    list_name: "In Progress",
    card_title: "Build authentication module",
    description: "JWT-based auth with refresh token rotation.",
    labels: ["High"],
    due_date: "2026-07-25",
    checklist: {
      title: "Steps",
      items: ["Login endpoint", "Token refresh endpoint", "Logout endpoint", "Unit tests"],
    },
  },
  {
    list_name: "In Review",
    card_title: "Code review: payment integration",
    description: "Review Stripe webhook handler for idempotency and error handling.",
    labels: ["High"],
    due_date: "2026-07-18",
    checklist: null,
  },
  {
    list_name: "Done",
    card_title: "Project kickoff meeting",
    description: "Align all stakeholders on timeline and deliverables.",
    labels: ["Low"],
    due_date: null,
    checklist: null,
  },
];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function validateJson(file: File) {
  if (USE_MOCK) {
    await delay(1200); // Simulate network latency

    // Check file is json
    if (!file.name.endsWith(".json")) {
      return {
        valid: false,
        card_count: 0,
        labels: [],
        lists: [],
        error: "Only .json files are accepted."
      };
    }

    try {
      // Parse file content on client-side to simulate validation
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed)) {
        return {
          valid: false,
          card_count: 0,
          labels: [],
          lists: [],
          error: "JSON must be a top-level array of card objects."
        };
      }

      // Check for mandatory fields in mock
      for (const item of parsed) {
        // Skip comment lines
        if (item._comment || item._rules) continue;

        if (!item.list_name || !item.card_title) {
          return {
            valid: false,
            card_count: 0,
            labels: [],
            lists: [],
            error: "All valid card objects must contain 'list_name' and 'card_title'."
          };
        }
      }

      // Process and extract lists, labels
      const lists: string[] = [];
      const labelsSet = new Set<string>();
      const cards: Card[] = [];

      parsed.forEach(item => {
        if (item._comment || item._rules) return;
        
        const card: Card = {
          list_name: String(item.list_name).trim(),
          card_title: String(item.card_title).trim(),
          description: item.description ? String(item.description) : "",
          labels: Array.isArray(item.labels) ? item.labels.map((l: any) => String(l).trim()) : [],
          due_date: item.due_date ? String(item.due_date) : null,
          checklist: item.checklist && typeof item.checklist === "object" ? {
            title: item.checklist.title ? String(item.checklist.title) : "Tasks",
            items: Array.isArray(item.checklist.items) ? item.checklist.items.map((i: any) => String(i)) : []
          } : null
        };
        
        cards.push(card);

        if (!lists.includes(card.list_name)) {
          lists.push(card.list_name);
        }
        card.labels.forEach(lbl => labelsSet.add(lbl));
      });

      const labelColorsAssign = ["green", "yellow", "orange", "red", "purple", "blue", "sky", "lime", "pink", "black"] as TrelloColor[];
      const labels = Array.from(labelsSet).map((name, idx) => ({
        name,
        default_color: labelColorsAssign[idx % labelColorsAssign.length]
      }));

      return {
        valid: true,
        card_count: cards.length,
        labels,
        lists,
        cards,
        error: null
      };

    } catch (e: any) {
      return {
        valid: false,
        card_count: 0,
        labels: [],
        lists: [],
        error: `JSON parsing failed: ${e.message}`
      };
    }
  }

  // Real backend call
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/validate-json", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    let errMsg = "Validation failed on the server.";
    try {
      const errRes = await res.json();
      if (errRes.detail && errRes.detail[0]) {
        errMsg = errRes.detail[0].msg;
      } else if (errRes.error) {
        errMsg = errRes.error;
      }
    } catch {}
    throw new Error(errMsg);
  }

  const data = await res.json();
  if (data.valid) {
    // If successful, we read standard file contents client-side to supply list of cards to Step 2
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const cards: Card[] = parsed.filter((item: any) => !item._comment && !item._rules).map((item: any) => ({
        list_name: item.list_name || "",
        card_title: item.card_title || "",
        description: item.description || "",
        labels: item.labels || [],
        due_date: item.due_date || null,
        checklist: item.checklist || null,
      }));
      return { ...data, cards };
    } catch {
      return { ...data, cards: [] };
    }
  }
  return data;
}

export async function buildBoard(payload: BuildRequest) {
  if (USE_MOCK) {
    await delay(1000);
    return {
      job_id: "mock-job-" + Math.random().toString(36).slice(2),
      message: "Build started."
    };
  }

  // Real API call
  const res = await fetch("/api/build", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    if (res.status === 422 && errorData.detail) {
      const messages = errorData.detail.map((err: any) => `${err.loc.join(".")}: ${err.msg}`).join(", ");
      throw new Error(`Validation Error: ${messages}`);
    }
    throw new Error(errorData.message || "Endpoint returned server error.");
  }

  return res.json();
}

export function streamLogs(
  jobId: string,
  onMessage: (line: string) => void,
  onDone: (result: { status: "success" | "error"; board_url?: string; message?: string }) => void
): () => void {
  if (USE_MOCK) {
    // Exact logs from Section 6
    const lines = [
      "12:34:56 | INFO    | Connecting to Trello API...",
      "12:34:57 | INFO    | Board 'My Project' not found, creating...",
      "12:34:58 | INFO    | Created board: My Project",
      "12:34:58 | INFO    | Creating list: Backlog",
      "12:34:59 | INFO    | Creating list: To Do",
      "12:34:59 | INFO    | Creating list: In Progress",
      "12:35:00 | INFO    | Creating list: In Review",
      "12:35:00 | INFO    | Creating list: Done",
      "12:35:01 | INFO    | Creating label: Low (green)",
      "12:35:01 | INFO    | Creating label: Medium (yellow)",
      "12:35:02 | INFO    | Creating label: High (red)",
      "12:35:02 | INFO    | Building 7 cards...",
      "12:35:03 | INFO    | Card 1/7: Define project scope",
      "12:35:03 | INFO    | Card 2/7: Set up repository",
      "12:35:04 | INFO    | Card 3/7: Design database schema",
      "12:35:04 | INFO    | Card 4/7: Write API contracts",
      "12:35:05 | INFO    | Card 5/7: Build authentication module",
      "12:35:05 | INFO    | Card 6/7: Code review: payment integration",
      "12:35:06 | INFO    | Card 7/7: Project kickoff meeting",
      "12:35:07 | SUCCESS | Board ready: https://trello.com/b/MOCKBOARD",
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i < lines.length) {
        onMessage(lines[i]);
        i++;
      } else {
        clearInterval(interval);
        onDone({ status: "success", board_url: "https://trello.com/b/MOCKBOARD" });
      }
    }, 400);

    return () => clearInterval(interval);
  }

  // Real EventSource client
  const es = new EventSource(`/api/status/${jobId}`);

  es.onmessage = (event) => {
    if (event.data) {
      onMessage(event.data);
    }
  };

  es.addEventListener("done", (event) => {
    try {
      const result = JSON.parse(event.data);
      onDone(result);
    } catch (e) {
      onDone({ status: "error", message: "Failed to parse final build status." });
    }
    es.close();
  });

  es.onerror = () => {
    onDone({ status: "error", message: "Trello Board Build SSE connection lost." });
    es.close();
  };

  return () => {
    es.close();
  };
}
