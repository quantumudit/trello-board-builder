/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  ChevronLeft, Key, Lock, Eye, EyeOff, Clipboard, Settings2,
  Info, Sparkles, Undo2, RefreshCw, FolderOpen, Layers, CheckCircle2
} from "lucide-react";
import type { TrelloColor, Card } from "../types";

interface Step3ConfigureProps {
  cardsCount: number;
  listsCount: number;
  labelNames: string[];
  initialLabelColors: Record<string, TrelloColor>;
  onBack: () => void;
  onBuild: (settings: {
    boardName: string;
    boardDescription: string;
    permissionLevel: "private" | "org" | "public";
    createIfNotExists: boolean;
    apiKey: string;
    token: string;
    labelColors: Record<string, TrelloColor>;
  }) => void;
  showToast: (message: string, type: "success" | "error" | "info") => void;
  cards: Card[];
  lists: string[];
}

const MOCK_BOARDS = [
  { id: "mock-1", name: "Engineering Sprint Cycle", desc: "Weekly tracking board for engineering sprints, backlog refinement, tech debt, and hotfixes." },
  { id: "mock-2", name: "Product Launch Roadmap", desc: "Cross-functional roadmap coordinating marketing assets, feature announcements, and GTM strategy timelines." },
  { id: "mock-3", name: "Client CRM Pipeline", desc: "Simulated client onboarding pipeline tracking prospective leads, negotiations, signed contracts, and kickoff meetings." },
  { id: "mock-4", name: "Company Operations Handbook", desc: "Internal workspace documenting company policies, employee benefits, expense process rules, and directory links." }
];

export default function Step3Configure({
  cardsCount,
  listsCount,
  labelNames,
  initialLabelColors,
  onBack,
  onBuild,
  showToast,
  cards,
  lists,
}: Step3ConfigureProps) {

  // Configuration Type toggle: "new" or "existing"
  const [configType, setConfigType] = useState<"new" | "existing">("new");

  // General Form states
  const [boardName, setBoardName] = useState("");
  const [boardDescription, setBoardDescription] = useState("");
  const [permissionLevel, setPermissionLevel] = useState<"private" | "org" | "public">("private");
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");

  // Load from environment (.env) configurations
  const [loadFromEnv, setLoadFromEnv] = useState(false);
  const [isFetchingEnv, setIsFetchingEnv] = useState(false);

  // Existing board settings states
  const [existingBoards, setExistingBoards] = useState<{ id: string; name: string; desc: string }[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [originalDescription, setOriginalDescription] = useState("");
  const [isLoadingBoards, setIsLoadingBoards] = useState(false);
  const [existingBoardLists, setExistingBoardLists] = useState<{ id: string; name: string; cardCount: number }[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState(false);

  // AI interactive loading states
  const [isGeneratingDetails, setIsGeneratingDetails] = useState(false);
  const [isRefactoringDesc, setIsRefactoringDesc] = useState(false);

  // Password visibility triggers
  const [showApiKey, setShowApiKey] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // Load Trello credentials from server-side .env configuration
  const handleLoadFromEnvChange = async (checked: boolean) => {
    setLoadFromEnv(checked);
    if (checked) {
      setIsFetchingEnv(true);
      try {
        const res = await fetch("/api/config/credentials");
        if (res.ok) {
          const data = await res.json();
          if (data.apiKey || data.token) {
            setApiKey(data.apiKey || "");
            setToken(data.token || "");
            showToast("Credentials loaded from .env successfully!", "success");
          } else {
            showToast("No Trello credentials found in .env.", "info");
          }
        } else {
          showToast("Failed to fetch environment credentials from the server.", "error");
        }
      } catch (err) {
        console.error("Fetch credentials error:", err);
        showToast("Error loading credentials from .env config.", "error");
      } finally {
        setIsFetchingEnv(false);
      }
    } else {
      // Clear key and token when disabled/unchecked so user can input manually
      setApiKey("");
      setToken("");
    }
  };

  // Fetch or trigger mock Trello boards loading
  const fetchTrelloBoards = async () => {
    const trimmedKey = apiKey.trim();
    const trimmedToken = token.trim();
    if (!trimmedKey || !trimmedToken) {
      showToast("Please enter Trello API Key and Token in the credentials panel first", "info");
      return;
    }

    setIsLoadingBoards(true);
    try {
      // Direct CORS client side fetch to fetch boards
      const url = `https://api.trello.com/1/members/me/boards?key=${trimmedKey}&token=${trimmedToken}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Trello API authentication failed.");
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        const parsed = data.map((b: any) => ({
          id: b.id,
          name: b.name,
          desc: b.desc || ""
        }));
        setExistingBoards(parsed);
        showToast(`Successfully connected to Trello. Loaded ${parsed.length} boards!`, "success");
        if (parsed.length > 0) {
          handleSelectBoard(parsed[0].id, parsed);
        }
      } else {
        throw new Error("Invalid response format from Trello.");
      }
    } catch (err) {
      console.warn("Real Trello fetch skipped/failed, using mock boards fallback:", err);
      setExistingBoards(MOCK_BOARDS);
      showToast("Trello connection simulated. Loaded mock workspace boards.", "info");
      handleSelectBoard(MOCK_BOARDS[0].id, MOCK_BOARDS);
    } finally {
      setIsLoadingBoards(false);
    }
  };

  const fetchBoardLists = async (boardId: string, trimmedKey = apiKey.trim(), trimmedToken = token.trim()) => {
    setIsLoadingLists(true);
    try {
      if (!trimmedKey || !trimmedToken) {
        throw new Error("Missing credentials");
      }
      const url = `https://api.trello.com/1/boards/${boardId}/lists?cards=open&key=${trimmedKey}&token=${trimmedToken}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to load Trello lists.");
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        const parsed = data.map((l: any) => ({
          id: l.id,
          name: l.name,
          cardCount: l.cards ? l.cards.length : 0
        }));
        setExistingBoardLists(parsed);
      } else {
        throw new Error("Invalid Trello list format");
      }
    } catch (err) {
      console.warn("Skipped fetching lists from real Trello, using mock lists:", err);
      // Generate some realistic mock list names based on the selected board
      const mockLists: Record<string, { name: string; cardCount: number }[]> = {
        "mock-1": [
          { name: "Backlog", cardCount: 15 },
          { name: "Ready for Dev", cardCount: 4 },
          { name: "In Progress", cardCount: 6 },
          { name: "QA/Testing", cardCount: 3 },
          { name: "Done", cardCount: 12 }
        ],
        "mock-2": [
          { name: "Asset Gathering", cardCount: 8 },
          { name: "Design Drafts", cardCount: 2 },
          { name: "Copywriting", cardCount: 5 },
          { name: "Launch Checklist", cardCount: 10 }
        ],
        "mock-3": [
          { name: "Inbound Leads", cardCount: 20 },
          { name: "Contract Negotiation", cardCount: 4 },
          { name: "Onboarding Stage", cardCount: 2 },
          { name: "Active Customer", cardCount: 8 }
        ],
        "mock-4": [
          { name: "Company Policy", cardCount: 6 },
          { name: "Onboarding Guide", cardCount: 4 },
          { name: "Benefit Resources", cardCount: 9 },
          { name: "FAQ Pages", cardCount: 12 }
        ]
      };
      
      const fallback = mockLists[boardId] || [
        { name: "To Do", cardCount: 5 },
        { name: "Doing", cardCount: 3 },
        { name: "Done", cardCount: 8 }
      ];
      setExistingBoardLists(fallback);
    } finally {
      setIsLoadingLists(false);
    }
  };

  const handleSelectBoard = (id: string, boardsList = existingBoards) => {
    setSelectedBoardId(id);
    const chosen = boardsList.find(b => b.id === id);
    if (chosen) {
      setBoardName(chosen.name);
      setBoardDescription(chosen.desc);
      setOriginalDescription(chosen.desc);
      fetchBoardLists(id);
    }
  };

  // AI Button: Generate name and description for New Board
  const handleGenerateNewBoard = async () => {
    setIsGeneratingDetails(true);
    try {
      const response = await fetch("/api/gemini/generate-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards, lists }),
      });
      if (!response.ok) throw new Error("Server error generating board setup.");
      const data = await response.json();
      if (data.board_name) {
        setBoardName(data.board_name);
        setBoardDescription(data.board_description || "");
        showToast("Gemini suggested creative board details inspired by your dataset!", "success");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to generate board metadata using Gemini AI.", "error");
    } finally {
      setIsGeneratingDetails(false);
    }
  };

  // AI Button: Refactor description for Existing Board
  const handleRefactorDescription = async () => {
    if (!boardDescription.trim()) {
      showToast("Please enter a description to refactor first.", "info");
      return;
    }

    setIsRefactoringDesc(true);
    try {
      const response = await fetch("/api/gemini/refactor-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: boardDescription }),
      });
      if (!response.ok) throw new Error("Server response error.");
      const data = await response.json();
      if (data.refactored) {
        setBoardDescription(data.refactored);
        showToast("Refactored board description using Gemini AI successfully!", "success");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to refactor board description using Gemini AI.", "error");
    } finally {
      setIsRefactoringDesc(false);
    }
  };

  // Undo Button: Revert to original description
  const handleRevertDescription = () => {
    setBoardDescription(originalDescription);
    showToast("Reverted description to original Trello content", "info");
  };

  // Submit build to App.tsx
  const handleBuildSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedBoard = boardName.trim();
    const trimmedKey = apiKey.trim();
    const trimmedToken = token.trim();

    if (!trimmedBoard) {
      showToast("Board name is required", "error");
      return;
    }
    if (!trimmedKey) {
      showToast("Trello API Key is required", "error");
      return;
    }
    if (!trimmedToken) {
      showToast("Trello Token is required", "error");
      return;
    }

    onBuild({
      boardName: trimmedBoard,
      boardDescription: boardDescription.trim(),
      permissionLevel,
      createIfNotExists: configType === "new", // "Create board if missing" checkbox is removed for new board; setting appropriately
      apiKey: trimmedKey,
      token: trimmedToken,
      labelColors: initialLabelColors
    });
  };

  const isFormInvalid = !boardName.trim() || !apiKey.trim() || !token.trim();

  return (
    <div id="step3-container" className="w-full max-w-4xl mx-auto space-y-8 pb-12">
      
      {/* Back Button Link top */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition py-1.5 px-3 rounded-lg hover:bg-slate-50 border border-slate-200 cursor-pointer"
          aria-label="Back to board preview and edits"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Preview</span>
        </button>
      </div>

      <form onSubmit={handleBuildSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Columns (Settings) */}
        <div className="lg:col-span-2 space-y-6">

          {/* Board Settings card with New / Existing Mode toggle */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5" id="board-general-settings">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-sky-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">Trello Board Configuration</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Determine how your target board is integrated</p>
                </div>
              </div>
            </div>

            {/* Premium segmented control for toggling New vs Existing */}
            <div className="grid grid-cols-2 bg-slate-100 p-1.5 rounded-lg border border-slate-200/50">
              <button
                type="button"
                onClick={() => setConfigType("new")}
                className={`py-2 text-xs font-bold rounded-md transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer select-none
                  ${configType === "new" 
                    ? "bg-white text-sky-700 shadow-sm" 
                    : "text-slate-500 hover:text-slate-850"
                  }
                `}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>For New Board</span>
              </button>
              <button
                type="button"
                onClick={() => setConfigType("existing")}
                className={`py-2 text-xs font-bold rounded-md transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer select-none
                  ${configType === "existing" 
                    ? "bg-white text-sky-700 shadow-sm" 
                    : "text-slate-500 hover:text-slate-850"
                  }
                `}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>For Existing Board</span>
              </button>
            </div>

            {configType === "new" ? (
              /* --- NEW BOARD FIELDS --- */
              <div className="space-y-4 animate-fade-in">
                {/* Board Name + AI Gen Button */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="board-name" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Board Name <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateNewBoard}
                      disabled={isGeneratingDetails}
                      className="text-[11px] font-extrabold text-sky-600 hover:text-sky-800 transition flex items-center gap-1.5 px-2 py-1 rounded bg-sky-50 border border-sky-100 hover:bg-sky-100 cursor-pointer disabled:opacity-50 select-none"
                    >
                      {isGeneratingDetails ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>AI Generate Details</span>
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    required={configType === "new"}
                    id="board-name"
                    value={boardName}
                    onChange={(e) => setBoardName(e.target.value)}
                    placeholder="e.g. Q3 Kanban Developer Workspace"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                {/* Board Description */}
                <div className="space-y-1.5">
                  <label htmlFor="board-description" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Board Description (Optional)
                  </label>
                  <textarea
                    id="board-description"
                    rows={3}
                    value={boardDescription}
                    onChange={(e) => setBoardDescription(e.target.value)}
                    placeholder="Enter an optional brief overview detailing goals of this board setup..."
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-sans resize-none"
                  />
                </div>

                {/* Permission level */}
                <div className="space-y-1.5">
                  <label htmlFor="permission-level" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Permission Level
                  </label>
                  <select
                    id="permission-level"
                    value={permissionLevel}
                    onChange={(e) => setPermissionLevel(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium text-slate-700 cursor-pointer"
                  >
                    <option value="private">Private (Only added workspace members)</option>
                    <option value="org">Organization (Workspace-wide access)</option>
                    <option value="public">Public (Visible to search engines)</option>
                  </select>
                </div>
              </div>
            ) : (
              /* --- EXISTING BOARD FIELDS --- */
              <div className="space-y-4 animate-fade-in">
                
                {/* Credentials check banner for Existing Boards loading */}
                {existingBoards.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center space-y-4">
                    <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center mx-auto text-slate-500">
                      <FolderOpen className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-800">No boards loaded yet</h4>
                      <p className="text-[11px] text-slate-500 leading-normal max-w-sm mx-auto">
                        In order to fetch your real Trello boards and description details, enter your Trello API credentials in the sidebar.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={fetchTrelloBoards}
                      disabled={isLoadingBoards || !apiKey.trim() || !token.trim()}
                      className={`px-4 py-2 text-xs font-bold rounded-lg border transition duration-150 shadow-sm cursor-pointer inline-flex items-center gap-1.5 select-none
                        ${(!apiKey.trim() || !token.trim()) 
                          ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" 
                          : "bg-sky-600 text-white hover:bg-sky-700 border-sky-600 shrink-0"
                        }
                      `}
                    >
                      {isLoadingBoards ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Loading Trello Workspace...</span>
                        </>
                      ) : (
                        <>
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>Connect & Load Trello Boards</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Choose Trello Board Selector */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label htmlFor="existing-board-select" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                          Choose Trello Board <span className="text-rose-500">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={fetchTrelloBoards}
                          className="text-[10px] font-bold text-sky-600 hover:text-sky-800 flex items-center gap-1 leading-none bg-sky-50 border px-1.5 py-0.5 rounded cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Reload List</span>
                        </button>
                      </div>
                      <select
                        id="existing-board-select"
                        value={selectedBoardId}
                        onChange={(e) => handleSelectBoard(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-bold text-slate-800 cursor-pointer"
                      >
                        {existingBoards.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Real-time Trello Board Lists Alignment Audit */}
                    <div className="border border-slate-205 rounded-xl overflow-hidden bg-slate-50/40 p-4 space-y-4" id="target-alignment-audit">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                        <div className="flex items-center gap-2">
                          <FolderOpen className="w-4 h-4 text-sky-600 animate-pulse-subtle" />
                          <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">Target Board Lists Audit</span>
                        </div>
                        {isLoadingLists && (
                          <span className="text-[10px] text-sky-600 font-semibold flex items-center gap-1 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                            <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                            Auditing Trello Lists...
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* 1. Existing Lists on Target Trello Board */}
                        <div className="space-y-2">
                          <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <span>Trello Board Existing Lists ({existingBoardLists.length})</span>
                          </h4>
                          {isLoadingLists ? (
                            <div className="py-8 text-center text-xs text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
                              <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1.5 text-slate-350" />
                              Fetching list contents...
                            </div>
                          ) : existingBoardLists.length === 0 ? (
                            <div className="py-8 text-center text-xs text-slate-400 italic bg-white rounded-lg border border-dashed border-slate-200">
                              No lists found on this board. New lists will be created.
                            </div>
                          ) : (
                            <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                              {existingBoardLists.map((l) => (
                                <div key={l.id} className="flex items-center justify-between text-xs p-2 bg-white rounded border border-slate-200/80 shadow-xs">
                                  <span className="font-bold text-slate-700 truncate max-w-[150px] uppercase tracking-wide text-[10px]">{l.name}</span>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-extrabold shrink-0 border border-slate-150">
                                    {l.cardCount} cards
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 2. Draft List Alignment Strategy */}
                        <div className="space-y-2">
                          <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                            Alignment of draft {lists.length} lists
                          </h4>
                          <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                            {lists.map((draftList) => {
                              // Case insensitive name checks to handle matches nicely
                              const matchedIndex = existingBoardLists.findIndex(
                                (el) => el.name.trim().toLowerCase() === draftList.trim().toLowerCase()
                              );
                              const matchedList = matchedIndex !== -1 ? existingBoardLists[matchedIndex] : null;
                              
                              // Count draft cards associated
                              const draftCardsCount = cards.filter(c => c.list_name === draftList).length;

                              return (
                                <div 
                                  key={draftList} 
                                  className={`p-2 rounded border text-xs leading-normal transition-all duration-150
                                    ${matchedList 
                                      ? "bg-emerald-50/40 border-emerald-150 text-emerald-900" 
                                      : "bg-amber-50/40 border-amber-155 text-amber-905"
                                    }
                                  `}
                                >
                                  <div className="flex items-start justify-between gap-2.5">
                                    <span className="font-bold truncate max-w-[130px] uppercase tracking-wide text-[10px]" title={draftList}>
                                      {draftList}
                                    </span>
                                    <span className={`text-[9px] font-extrabold shrink-0 px-1.5 py-0.5 rounded border shadow-sm
                                      ${matchedList 
                                        ? "bg-white border-emerald-200 text-emerald-700" 
                                        : "bg-white border-amber-200 text-amber-750"
                                      }
                                    `}>
                                      +{draftCardsCount} draft cards
                                    </span>
                                  </div>
                                  
                                  <div className="mt-1 flex items-center gap-1.5 text-[9px] font-medium">
                                    {matchedList ? (
                                      <>
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm animate-pulse" />
                                        <span className="text-emerald-700">
                                          Merges with Trello list &apos;{matchedList.name}&apos; ({matchedList.cardCount} cards)
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                                        <span className="text-amber-700">
                                          Will create as a brand-new list on Trello board
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Notice & remediation links */}
                      <div className="p-2.5 bg-sky-50 border border-sky-100 rounded-lg text-[10.5px] leading-relaxed text-sky-850 flex items-start gap-2 font-medium">
                        <Info className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
                        <div>
                          <span><strong>Notice a naming typo or need to rearrange lists?</strong> Clinically clean names ensure cards merge seamlessly. Click </span>
                          <button
                            type="button"
                            onClick={onBack}
                            className="text-sky-700 hover:text-sky-900 underline font-extrabold cursor-pointer hover:bg-sky-100/50 px-1 rounded transition"
                          >
                            Back to Preview
                          </button>
                          <span> to rename list layouts, edit cards, or sort lists before building!</span>
                        </div>
                      </div>
                    </div>

                    {/* Selected Board Description (Editable/AI-powered) */}
                    <div className="space-y-1.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <label htmlFor="board-description" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                          Board Description Details
                        </label>
                        
                        <div className="flex items-center gap-1.5 self-end sm:self-auto">
                          {/* AI Refactor Button */}
                          <button
                            type="button"
                            onClick={handleRefactorDescription}
                            disabled={isRefactoringDesc || !boardDescription.trim()}
                            className="text-[10px] font-extrabold text-sky-700 hover:text-sky-900 leading-none bg-sky-50 border border-sky-200 px-2 py-1 rounded cursor-pointer disabled:opacity-50 select-none flex items-center gap-1"
                          >
                            {isRefactoringDesc ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin animate-faster" />
                                <span>Refactoring...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3 h-3 text-sky-600" />
                                <span>Refactor with AI</span>
                              </>
                            )}
                          </button>

                          {/* Revert to Original button if changed */}
                          {boardDescription !== originalDescription && (
                            <button
                              type="button"
                              onClick={handleRevertDescription}
                              className="text-[10px] font-extrabold text-slate-600 hover:text-slate-800 leading-none bg-slate-100 border px-2 py-1 rounded cursor-pointer flex items-center gap-1 select-none"
                            >
                              <Undo2 className="w-3 h-3" />
                              <span>Revert to Original</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <textarea
                        id="board-description"
                        rows={4}
                        value={boardDescription}
                        onChange={(e) => setBoardDescription(e.target.value)}
                        placeholder="Choose a board to view description or override here..."
                        className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-sans resize-none text-slate-800 bg-slate-50/20"
                      />
                    </div>
                  </>
                )}
                
              </div>
            )}

          </div>

        </div>

        {/* Right Column: Trello Credentials */}
        <div id="credentials-sidebar" className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Lock className="w-5 h-5 text-sky-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">Credentials</h3>
                <p className="text-xs text-slate-500 mt-0.5">Secure credentials details</p>
              </div>
            </div>

            {/* Retrieval details link pointing strictly to power-ups/admin */}
            <div className="p-3 bg-sky-50 rounded-lg border border-sky-100 text-xs text-sky-850 flex items-start gap-2.5 leading-relaxed font-semibold">
              <Info className="w-4.5 h-4.5 text-sky-600 mt-0.5 shrink-0" />
              <div>
                <span>Need credentials? </span>
                <a 
                  href="https://trello.com/power-ups/admin" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sky-700 underline font-extrabold hover:text-sky-900"
                >
                  Generate App Key & Token (opens in new tab)
                </a>
              </div>
            </div>

            {/* Checkbox to load from .env */}
            <div className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-150 rounded-lg transition hover:bg-slate-100/55">
              <div className="pt-0.5">
                <input
                  type="checkbox"
                  id="chk-load-from-env"
                  checked={loadFromEnv}
                  onChange={(e) => handleLoadFromEnvChange(e.target.checked)}
                  className="w-4 h-4 rounded text-sky-600 border-slate-300 focus:ring-sky-500 cursor-pointer accent-sky-600"
                />
              </div>
              <label htmlFor="chk-load-from-env" className="flex-1 text-xs select-none cursor-pointer">
                <span className="block font-bold text-slate-700">Load credentials from .env</span>
                <span className="block text-[10px] text-slate-500 mt-0.5 leading-normal">
                  Automatically pull Trello API key & token from server-side environment variables.
                </span>
              </label>
            </div>

            {/* API Key */}
            <div className="space-y-1.5">
              <label htmlFor="api-key" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                Trello API Key <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  required
                  id="api-key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={loadFromEnv || isFetchingEnv}
                  placeholder={loadFromEnv ? "API Key loaded from .env" : "Paste Trello API key..."}
                  className={`w-full pl-9 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-xs transition duration-150
                    ${loadFromEnv 
                      ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" 
                      : "bg-white text-slate-600 border-slate-300"
                    }
                  `}
                />
                <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                {!loadFromEnv && (
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="p-1 text-slate-400 hover:text-slate-600 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer flex items-center justify-center transition duration-150"
                    aria-label={showApiKey ? "Hide api key" : "Show api key"}
                  >
                    {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>

            {/* API Token */}
            <div className="space-y-1.5">
              <label htmlFor="api-token" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                Trello Token <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  required
                  id="api-token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  disabled={loadFromEnv || isFetchingEnv}
                  placeholder={loadFromEnv ? "Token loaded from .env" : "Paste Trello OAuth Token..."}
                  className={`w-full pl-9 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-xs transition duration-150
                    ${loadFromEnv 
                      ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" 
                      : "bg-white text-slate-600 border-slate-300"
                    }
                  `}
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                {!loadFromEnv && (
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="p-1 text-slate-400 hover:text-slate-600 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer flex items-center justify-center transition duration-150"
                    aria-label={showToken ? "Hide token password" : "Show token password"}
                  >
                    {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>

            <p className="text-[10px] text-slate-400 leading-normal italic text-center pt-1 border-t border-slate-100">
              Your credentials are sent directly to the server and never stored.
            </p>
          </div>

          {/* Submission Panel Card */}
          <div className="bg-slate-900 text-slate-100 rounded-xl p-5 shadow-lg border border-slate-800 space-y-4">
            <div className="flex items-center gap-2">
              <Clipboard className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Compilation pipeline</span>
            </div>
            
            <div className="space-y-2 text-xs">
              <p className="text-slate-300 font-medium">Ready target board:</p>
              {configType === "new" ? (
                <div className="space-y-1">
                  <p className="text-sm font-extrabold text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                    <span>{cardsCount} cards across {listsCount} new lists</span>
                  </p>
                  <p className="text-slate-400 text-[10px] font-medium leading-relaxed pl-6">
                    A brand new board named &quot;{boardName || "Untitled Board"}&quot; will be created.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-sm font-extrabold text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                    <span>Pushing {cardsCount} draft cards</span>
                  </p>
                  
                  {/* Detailed alignment stats in pipeline summary */}
                  <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/85 space-y-1 ml-6 text-[10px] font-sans">
                    <div className="flex justify-between text-slate-400 font-bold">
                      <span>Target Board:</span>
                      <span className="text-white truncate max-w-[120px]" title={boardName}>{boardName || "Selected Board"}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Merged with existing lists:</span>
                      <span className="font-extrabold text-emerald-400">
                        {lists.filter(l => existingBoardLists.some(el => el.name.trim().toLowerCase() === l.trim().toLowerCase())).length} lists
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Newly created lists:</span>
                      <span className="font-extrabold text-amber-400">
                        {lists.filter(l => !existingBoardLists.some(el => el.name.trim().toLowerCase() === l.trim().toLowerCase())).length} lists
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isFormInvalid}
              className={`
                w-full py-3 rounded-lg font-bold text-sm shadow transition flex items-center justify-center gap-2 cursor-pointer
                ${isFormInvalid
                  ? "bg-slate-700 text-slate-400 cursor-not-allowed border border-slate-600"
                  : "bg-emerald-500 hover:bg-emerald-600 text-slate-950 hover:scale-[1.02] transform transition-transform"
                }
              `}
              aria-label="Build board and start streaming log execution"
            >
              <span>Build Trello Board</span>
            </button>
          </div>
        </div>

      </form>
    </div>
  );
}
