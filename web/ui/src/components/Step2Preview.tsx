/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { 
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ArrowRight, Plus, Pencil, Trash, Calendar, CheckSquare, 
  X, Trash2, Layout, SlidersHorizontal, AlertTriangle, Tag, GripVertical 
} from "lucide-react";
import type { Card, TrelloColor } from "../types";
import { TRELLO_COLORS, getPillStyles } from "../utils/colors";
import { isPastDue, formatDateString } from "../utils/date";

interface Step2PreviewProps {
  cards: Card[];
  lists: string[];
  labelColors: Record<string, TrelloColor>;
  defaultLabels: { name: string; default_color: TrelloColor }[];
  onBack: () => void;
  onNext: (updatedCards: Card[], updatedLists: string[], updatedLabelColors?: Record<string, TrelloColor>) => void;
  showToast: (message: string, type: "success" | "error" | "info") => void;
}

export default function Step2Preview({ 
  cards, 
  lists: initialLists, 
  labelColors, 
  defaultLabels,
  onBack, 
  onNext, 
  showToast 
}: Step2PreviewProps) {
  
  const [boardCards, setBoardCards] = useState<Card[]>(cards);
  const [boardLists, setBoardLists] = useState<string[]>(initialLists);
  const [activeMobileList, setActiveMobileList] = useState<string | null>(initialLists[0] || null);

  // Add list state
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");

  // List editing state
  const [editingList, setEditingList] = useState<string | null>(null);
  const [editingListValue, setEditingListValue] = useState("");

  // Label configuration and bank states
  const [boardLabelColors, setBoardLabelColors] = useState<Record<string, TrelloColor>>(labelColors);
  const [customLabels, setCustomLabels] = useState<string[]>([]);
  const [hiddenDefaultLabels, setHiddenDefaultLabels] = useState<string[]>([]);
  const [newGlobalLabelName, setNewGlobalLabelName] = useState("");
  const [newGlobalLabelColor, setNewGlobalLabelColor] = useState<TrelloColor>("blue");

  // Label bank inline edit state
  const [editingLabelName, setEditingLabelName] = useState<string | null>(null);
  const [editingLabelNewName, setEditingLabelNewName] = useState("");
  const [editingLabelNewColor, setEditingLabelNewColor] = useState<TrelloColor>("blue");

  // Editor Modal state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingCardIndex, setEditingCardIndex] = useState<number | null>(null); // null means adding a new card
  const [modalFields, setModalFields] = useState<{
    list_name: string;
    card_title: string;
    description: string;
    labels: string[];
    start_date: string;
    due_date: string;
    hasChecklist: boolean;
    checklistTitle: string;
    checklistItems: string[];
  }>({
    list_name: "",
    card_title: "",
    description: "",
    labels: [],
    start_date: "",
    due_date: "",
    hasChecklist: false,
    checklistTitle: "Tasks",
    checklistItems: []
  });

  // Drag and Drop tracking states
  const [draggedCardIndex, setDraggedCardIndex] = useState<number | null>(null);
  const [dragOverList, setDragOverList] = useState<string | null>(null);
  const [dragEnabledIndex, setDragEnabledIndex] = useState<number | null>(null);
  const [dragOverCardIdx, setDragOverCardIdx] = useState<number | null>(null);
  const [dragOverCardPos, setDragOverCardPos] = useState<"before" | "after" | null>(null);

  // Checklist temp input
  const [newChecklistItem, setNewChecklistItem] = useState("");

  // Custom label addition in modal
  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [newCustomLabelColor, setNewCustomLabelColor] = useState<TrelloColor>("blue");

  // Deletion confirm state
  const [deletingCardIndex, setDeletingCardIndex] = useState<number | null>(null);

  // Map label name to a display color
  const getLabelColor = (labelName: string): TrelloColor => {
    if (boardLabelColors[labelName]) return boardLabelColors[labelName];
    const defaultMatch = defaultLabels.find(l => l.name === labelName);
    if (defaultMatch) return defaultMatch.default_color;
    return "blue"; // default backup
  };

  // Extract all unique label names across all cards and custom labels
  const allLabels = useMemo(() => {
    const labels = new Set<string>();
    defaultLabels.filter(l => !hiddenDefaultLabels.includes(l.name)).forEach(l => labels.add(l.name));
    boardCards.forEach(c => c.labels.forEach(l => labels.add(l)));
    customLabels.forEach(lbl => labels.add(lbl));
    return Array.from(labels);
  }, [defaultLabels, boardCards, customLabels, hiddenDefaultLabels]);

  // Rename a list safely
  const handleRenameList = (oldName: string, newName: string) => {
    newName = newName.trim();
    if (!newName) {
      setEditingList(null);
      return;
    }
    if (oldName === newName) {
      setEditingList(null);
      return;
    }
    if (boardLists.some(l => l.toLowerCase() === newName.toLowerCase() && l !== oldName)) {
      showToast("List name already exists", "error");
      return;
    }

    setBoardLists(prev => prev.map(l => l === oldName ? newName : l));
    setBoardCards(prev => prev.map(c => c.list_name === oldName ? { ...c, list_name: newName } : c));
    if (activeMobileList === oldName) {
      setActiveMobileList(newName);
    }
    setEditingList(null);
    showToast(`Renamed list to "${newName}"`, "success");
  };

  // Move a list left (or up in mobile)
  const handleMoveListLeft = (listName: string) => {
    const index = boardLists.indexOf(listName);
    if (index <= 0) return;
    const newLists = [...boardLists];
    const temp = newLists[index];
    newLists[index] = newLists[index - 1];
    newLists[index - 1] = temp;
    setBoardLists(newLists);
    showToast(`Moved list "${listName}" to position ${index}`, "success");
  };

  // Move a list right (or down in mobile)
  const handleMoveListRight = (listName: string) => {
    const index = boardLists.indexOf(listName);
    if (index === -1 || index >= boardLists.length - 1) return;
    const newLists = [...boardLists];
    const temp = newLists[index];
    newLists[index] = newLists[index + 1];
    newLists[index + 1] = temp;
    setBoardLists(newLists);
    showToast(`Moved list "${listName}" to position ${index + 2}`, "success");
  };

  const isBoardChanged = useMemo(() => {
    // Check lists structure
    if (boardLists.length !== initialLists.length) return true;
    for (let i = 0; i < boardLists.length; i++) {
      if (boardLists[i] !== initialLists[i]) return true;
    }

    // Check cards list
    if (boardCards.length !== cards.length) return true;
    for (let i = 0; i < boardCards.length; i++) {
      const c1 = boardCards[i];
      const c2 = cards[i];
      if (c1.card_title !== c2.card_title) return true;
      if (c1.list_name !== c2.list_name) return true;
      if ((c1.description || "") !== (c2.description || "")) return true;
      if ((c1.start_date || null) !== (c2.start_date || null)) return true;
      if ((c1.due_date || null) !== (c2.due_date || null)) return true;
      
      // Compare Labels
      const labels1 = c1.labels || [];
      const labels2 = c2.labels || [];
      if (labels1.length !== labels2.length) return true;
      for (let j = 0; j < labels1.length; j++) {
        if (labels1[j] !== labels2[j]) return true;
      }

      // Compare Checklist
      const ch1 = c1.checklist;
      const ch2 = c2.checklist;
      if (!ch1 !== !ch2) return true;
      if (ch1 && ch2) {
        if (ch1.title !== ch2.title) return true;
        const items1 = ch1.items || [];
        const items2 = ch2.items || [];
        if (items1.length !== items2.length) return true;
        for (let j = 0; j < items1.length; j++) {
          if (items1[j] !== items2[j]) return true;
        }
      }
    }

    // Check labelColors configuration
    const labelKeysCurrent = Object.keys(boardLabelColors || {});
    const labelKeysOrig = Object.keys(labelColors || {});
    if (labelKeysCurrent.length !== labelKeysOrig.length) return true;
    for (const key of labelKeysCurrent) {
      if (boardLabelColors[key] !== labelColors[key]) return true;
    }

    // Check custom labels
    if (customLabels.length > 0) return true;

    return false;
  }, [boardCards, boardLists, boardLabelColors, customLabels, cards, initialLists, labelColors]);

  // Create a global custom label bank entry
  const handleGlobalLabelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newGlobalLabelName.trim();
    if (!name) return;

    if (allLabels.includes(name)) {
      showToast("Label already exists in bank", "info");
      return;
    }

    setCustomLabels(prev => [...prev, name]);
    setBoardLabelColors(prev => ({
      ...prev,
      [name]: newGlobalLabelColor
    }));
    setNewGlobalLabelName("");
    showToast(`Created custom label "${name}"`, "success");
  };

  const handleSaveLabelEdit = () => {
    if (!editingLabelName) return;
    const newName = editingLabelNewName.trim();
    if (!newName) return;

    if (newName !== editingLabelName && allLabels.includes(newName)) {
      showToast("Label name already exists", "error");
      return;
    }

    if (newName !== editingLabelName) {
      setBoardCards(prev => prev.map(card => ({
        ...card,
        labels: card.labels.map(l => l === editingLabelName ? newName : l),
      })));
      setCustomLabels(prev => prev.map(l => l === editingLabelName ? newName : l));
      if (defaultLabels.some(l => l.name === editingLabelName)) {
        setHiddenDefaultLabels(prev => [...prev, editingLabelName]);
        setCustomLabels(prev => [...prev, newName]);
      }
    }

    setBoardLabelColors(prev => {
      const updated = { ...prev };
      delete updated[editingLabelName];
      updated[newName] = editingLabelNewColor;
      return updated;
    });

    setEditingLabelName(null);
    showToast(`Label updated to "${newName}"`, "success");
  };

  // Count active occurrences of a label on board cards
  const getLabelCount = (labelName: string): number => {
    return boardCards.filter(c => c.labels && c.labels.includes(labelName)).length;
  };

  // List additions
  const handleAddListSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    if (boardLists.some(l => l.toLowerCase() === name.toLowerCase())) {
      showToast("List name already exists", "error");
      return;
    }
    setBoardLists(prev => [...prev, name]);
    setNewListName("");
    setIsAddingList(false);
    setActiveMobileList(name);
    showToast(`Added list "${name}"`, "success");
  };

  // Card deletion
  const handleDeleteCard = (idx: number) => {
    const title = boardCards[idx].card_title;
    setBoardCards(prev => prev.filter((_, i) => i !== idx));
    setDeletingCardIndex(null);
    showToast(`Deleted "${title}"`, "success");
  };

  // Card Editor triggers
  const openEditModal = (cardIndex: number) => {
    const card = boardCards[cardIndex];
    setEditingCardIndex(cardIndex);
    setModalFields({
      list_name: card.list_name,
      card_title: card.card_title,
      description: card.description || "",
      labels: card.labels || [],
      start_date: card.start_date || "",
      due_date: card.due_date || "",
      hasChecklist: !!card.checklist,
      checklistTitle: card.checklist?.title || "Tasks",
      checklistItems: card.checklist?.items || []
    });
    setNewChecklistItem("");
    setNewCustomLabel("");
    setNewCustomLabelColor("blue");
    setIsEditorOpen(true);
  };

  const openNewCardModal = (prefilledList: string) => {
    setEditingCardIndex(null);
    setModalFields({
      list_name: prefilledList,
      card_title: "",
      description: "",
      labels: [],
      start_date: "",
      due_date: "",
      hasChecklist: false,
      checklistTitle: "Tasks",
      checklistItems: []
    });
    setNewChecklistItem("");
    setNewCustomLabel("");
    setNewCustomLabelColor("blue");
    setIsEditorOpen(true);
  };

  // Modal actions
  const handleSaveCard = (e: React.FormEvent) => {
    e.preventDefault();
    const title = modalFields.card_title.trim();
    if (!title) {
      showToast("Card title is required", "error");
      return;
    }

    if (modalFields.start_date && modalFields.due_date) {
      if (new Date(modalFields.start_date) > new Date(modalFields.due_date)) {
        showToast("Start Date cannot be after the Due Date", "error");
        return;
      }
    }

    const updatedCard: Card = {
      list_name: modalFields.list_name,
      card_title: title,
      description: modalFields.description,
      labels: modalFields.labels,
      start_date: modalFields.start_date ? modalFields.start_date : null,
      due_date: modalFields.due_date ? modalFields.due_date : null,
      checklist: modalFields.hasChecklist ? {
        title: modalFields.checklistTitle.trim() || "Tasks",
        items: modalFields.checklistItems.filter(item => item.trim() !== "")
      } : null
    };

    if (editingCardIndex !== null) {
      // Edit
      setBoardCards(prev => {
        const copy = [...prev];
        copy[editingCardIndex] = updatedCard;
        return copy;
      });
      showToast(`Updated "${title}"`, "success");
    } else {
      // Add new
      setBoardCards(prev => [...prev, updatedCard]);
      showToast(`Added "${title}"`, "success");
    }

    setIsEditorOpen(false);
  };

  // Drag-and-Drop operations
  const handleDragStart = (e: React.DragEvent, cardIdx: number) => {
    setDraggedCardIndex(cardIdx);
    e.dataTransfer.setData("text/plain", String(cardIdx));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggedCardIndex(null);
    setDragEnabledIndex(null);
    setDragOverCardIdx(null);
    setDragOverCardPos(null);
    setDragOverList(null);
  };

  const handleDragOverCard = (e: React.DragEvent, targetOriginalIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const isBefore = relativeY < rect.height / 2;
    if (dragOverCardIdx !== targetOriginalIdx || dragOverCardPos !== (isBefore ? "before" : "after")) {
      setDragOverCardIdx(targetOriginalIdx);
      setDragOverCardPos(isBefore ? "before" : "after");
    }
  };

  const handleDropOnList = (e: React.DragEvent, targetListName: string) => {
    e.preventDefault();
    const cardIdxStr = e.dataTransfer.getData("text/plain") || String(draggedCardIndex);
    if (cardIdxStr === "null" || cardIdxStr === "") return;
    const sourceIdx = parseInt(cardIdxStr, 10);
    
    if (isNaN(sourceIdx) || sourceIdx < 0 || sourceIdx >= boardCards.length) return;

    const sourceCard = boardCards[sourceIdx];
    if (sourceCard.list_name === targetListName) return;

    setBoardCards(prev => {
      const copy = [...prev];
      copy[sourceIdx] = {
        ...copy[sourceIdx],
        list_name: targetListName
      };
      return copy;
    });

    showToast(`Moved "${sourceCard.card_title}" to ${targetListName}`, "success");
    handleDragEnd();
  };

  const handleDropOnCard = (e: React.DragEvent, targetIdx: number, targetListName: string) => {
    e.stopPropagation();
    e.preventDefault();
    const cardIdxStr = e.dataTransfer.getData("text/plain") || String(draggedCardIndex);
    if (cardIdxStr === "null" || cardIdxStr === "") return;
    const sourceIdx = parseInt(cardIdxStr, 10);
    
    if (isNaN(sourceIdx) || sourceIdx < 0 || sourceIdx >= boardCards.length) return;
    if (sourceIdx === targetIdx) return;

    const sourceCard = boardCards[sourceIdx];

    setBoardCards(prev => {
      const copy = [...prev];
      const targetCard = prev[targetIdx];
      
      const [removed] = copy.splice(sourceIdx, 1);
      const updatedCard = { ...removed, list_name: targetListName };

      const currentTargetIdxInCopy = copy.indexOf(targetCard);
      let insertIdx = currentTargetIdxInCopy;
      if (dragOverCardPos === "after") {
        insertIdx = currentTargetIdxInCopy + 1;
      }

      copy.splice(insertIdx, 0, updatedCard);
      return copy;
    });

    showToast(`Repositioned "${sourceCard.card_title}"`, "success");
    handleDragEnd();
  };

  const addChecklistItem = () => {
    const item = newChecklistItem.trim();
    if (!item) return;
    setModalFields(prev => ({
      ...prev,
      checklistItems: [...prev.checklistItems, item]
    }));
    setNewChecklistItem("");
  };

  const removeChecklistItem = (i: number) => {
    setModalFields(prev => ({
      ...prev,
      checklistItems: prev.checklistItems.filter((_, idx) => idx !== i)
    }));
  };

  const toggleLabelCheckbox = (labelName: string) => {
    setModalFields(prev => {
      const isChecked = prev.labels.includes(labelName);
      const labels = isChecked 
        ? prev.labels.filter(l => l !== labelName)
        : [...prev.labels, labelName];
      return { ...prev, labels };
    });
  };

  const addCustomLabel = () => {
    const label = newCustomLabel.trim();
    if (!label) return;
    if (allLabels.includes(label)) {
      showToast("Label already exists", "info");
      return;
    }
    setCustomLabels(prev => [...prev, label]);
    setBoardLabelColors(prev => ({ ...prev, [label]: newCustomLabelColor }));
    setModalFields(prev => ({ ...prev, labels: [...prev.labels, label] }));
    setNewCustomLabel("");
  };

  const handleResetToOriginal = () => {
    // Make a deep clone of the original cards prop to prevent shared reference mutations
    const clonedOriginalCards = JSON.parse(JSON.stringify(cards)) as Card[];
    setBoardCards(clonedOriginalCards);
    setBoardLists([...initialLists]);
    if (labelColors) {
      setBoardLabelColors({ ...labelColors });
    }
    setCustomLabels([]);
    setHiddenDefaultLabels([]);
    setEditingLabelName(null);
    setActiveMobileList(initialLists[0] || null);
    setDeletingCardIndex(null);
    setIsEditorOpen(false);
    showToast("Board has been successfully reset to the original imported JSON order and titles!", "success");
  };

  // Continue triggers
  const handleContinue = () => {
    if (boardCards.length === 0) {
      showToast("Please add at least 1 card to configure rules.", "error");
      return;
    }
    onNext(boardCards, boardLists, boardLabelColors);
  };

  return (
    <div id="step2-container" className="w-full space-y-6">
      
      {/* 9.1 Header summary bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between bg-white border border-slate-200 px-6 py-4 rounded-xl shadow-sm gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition py-1.5 px-3 rounded-lg hover:bg-slate-50 border border-slate-200"
            aria-label="Back to file upload"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Change File</span>
          </button>
          
          <div className="h-5 w-px bg-slate-200 hidden sm:block" />
          
          <div className="text-sm font-semibold text-slate-800">
            <span className="text-sky-600 font-bold text-base">{boardCards.length}</span> cards across <span className="text-sky-600 font-bold text-base">{boardLists.length}</span> lists
          </div>
        </div>

        <button
          type="button"
          onClick={handleContinue}
          className="w-full sm:w-auto px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm rounded-lg shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer animate-pulse-subtle"
          aria-label="Continue to configure rules step"
        >
          <span>Continue to Configure</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* 9.5 Board controls toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 px-5 py-3 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <Layout className="w-4 h-4 text-sky-600" />
          <span>Interactive Board Preview</span>
          <span className="bg-sky-100 text-sky-800 font-bold rounded-full px-2 py-0.5 text-[10px]">
            {boardCards.length} Cards
          </span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <button
            type="button"
            disabled={!isBoardChanged}
            onClick={handleResetToOriginal}
            className={`flex items-center gap-2 text-xs font-bold transition-all px-2.5 py-1.5 rounded-lg border shadow-sm
              ${isBoardChanged 
                ? "text-slate-600 bg-white hover:bg-rose-50 hover:text-rose-650 hover:border-rose-200 active:scale-95 cursor-pointer" 
                : "text-slate-400 bg-slate-105 border-slate-200/80 cursor-not-allowed opacity-55"
              }
            `}
            title={isBoardChanged ? "Reset board, lists, cards, and labels back to initial imported JSON file state" : "No modifications detected on board yet"}
          >
            <SlidersHorizontal className={`w-3.5 h-3.5 ${isBoardChanged ? "text-slate-500" : "text-slate-400"}`} />
            <span>Reset Board to Imported JSON</span>
          </button>

          {/* Add List Input/Popover Inline container */}
          {isAddingList ? (
            <form onSubmit={handleAddListSubmit} className="flex items-center gap-1.5 animate-fade-in col-span">
              <input
                type="text"
                required
                autoFocus
                placeholder="List title (e.g. Backlog)"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                className="px-2.5 py-1 text-xs border border-sky-500 bg-white rounded focus:outline-none focus:ring-1 focus:ring-sky-500 font-medium"
              />
              <button 
                type="submit" 
                className="px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded text-xs font-bold shrink-0 cursor-pointer"
              >
                Done
              </button>
              <button 
                type="button" 
                onClick={() => { setIsAddingList(false); setNewListName(""); }} 
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingList(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 py-1.5 px-3 rounded-md transition cursor-pointer"
              aria-label="Add new list column"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add List</span>
            </button>
          )}
        </div>
      </div>

      {/* Global Labels Management Bank Widget */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
            <Tag className="w-4 h-4 text-sky-600" />
            <span>Labels Bank (Configure Global Labels)</span>
          </div>
          <span className="text-[10px] text-slate-450 font-semibold italic">Add custom labels here to configure them globally and use across multiple cards</span>
        </div>

        {/* List of current active labels */}
        <div className="flex flex-wrap gap-2 pt-0.5" id="labels-bank-list">
          {allLabels.length === 0 ? (
            <span className="text-xs text-slate-400 italic">No labels created yet. Add one below!</span>
          ) : (
            allLabels.map((lbl) => {
              const isEditing = editingLabelName === lbl;
              const color = getLabelColor(lbl);
              const pillStyles = getPillStyles(color);
              const count = getLabelCount(lbl);
              return (
                <div
                  key={lbl}
                  style={pillStyles}
                  className={`text-[10px] font-extrabold px-2.5 py-1 rounded-md flex items-center gap-1.5 uppercase tracking-wide select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition duration-150 group/lbl ${isEditing ? "ring-2 ring-white/60 scale-105" : "hover:scale-105"}`}
                  title={`${count} cards -- click pencil to edit`}
                >
                  <span>{lbl} ({count})</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingLabelName(lbl);
                      setEditingLabelNewName(lbl);
                      setEditingLabelNewColor(getLabelColor(lbl));
                    }}
                    className="w-3.5 h-3.5 rounded-full bg-white/20 hover:bg-white/50 flex items-center justify-center transition opacity-0 group-hover/lbl:opacity-100 shrink-0 cursor-pointer"
                    title={`Edit label "${lbl}"`}
                    aria-label={`Edit label ${lbl}`}
                  >
                    <Pencil className="w-2 h-2" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Inline Label Edit Form */}
        {editingLabelName && (
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 bg-sky-50 p-4 rounded-lg border border-sky-200">
            <div className="flex-grow">
              <input
                type="text"
                autoFocus
                value={editingLabelNewName}
                onChange={(e) => setEditingLabelNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleSaveLabelEdit(); }
                  else if (e.key === "Escape") setEditingLabelName(null);
                }}
                className="w-full px-3 py-1.5 text-xs bg-white border border-sky-300 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500 font-medium"
                placeholder="Label name..."
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Color:</span>
              <div className="flex flex-wrap items-center gap-1.5 bg-white p-1.5 border border-slate-200 rounded-md shadow-xs select-none">
                {(Object.keys(TRELLO_COLORS) as TrelloColor[]).map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setEditingLabelNewColor(color)}
                    style={{ backgroundColor: TRELLO_COLORS[color] }}
                    className={`w-5 h-5 rounded-full cursor-pointer transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                      editingLabelNewColor === color
                        ? "ring-2 ring-offset-1 ring-slate-800 scale-120 shadow-md z-10"
                        : "opacity-75 hover:opacity-100 hover:scale-[1.15]"
                    }`}
                    title={color}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSaveLabelEdit}
                className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-xs font-bold transition h-8 flex items-center justify-center cursor-pointer shadow-xs"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingLabelName(null)}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-md text-xs font-semibold transition h-8 flex items-center justify-center cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Inline Create Form */}
        <form onSubmit={handleGlobalLabelSubmit} className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4 bg-slate-50 p-4 rounded-lg border border-slate-150">
          <div className="flex-grow">
            <input
              type="text"
              required
              placeholder="Label name (e.g. Frontend, DevOps, API, Easy)..."
              value={newGlobalLabelName}
              onChange={(e) => setNewGlobalLabelName(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500 font-medium"
            />
          </div>
          
          {/* Circular Swatch Selection */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block shrink-0">Color swatch:</span>
            <div className="flex flex-wrap items-center gap-1.5 bg-white p-1.5 border border-slate-200 rounded-md shadow-xs select-none">
              {(Object.keys(TRELLO_COLORS) as TrelloColor[]).map((color) => {
                const hex = TRELLO_COLORS[color];
                const isSelected = newGlobalLabelColor === color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewGlobalLabelColor(color)}
                    style={{ backgroundColor: hex }}
                    className={`
                      w-5 h-5 rounded-full cursor-pointer transition-all duration-150 relative focus:outline-none focus:ring-1 focus:ring-sky-500
                      ${isSelected 
                        ? "ring-2 ring-offset-1 ring-slate-800 scale-120 shadow-md z-10" 
                        : "opacity-75 hover:opacity-100 hover:scale-[1.15]"
                      }
                    `}
                    title={`Select "${color}"`}
                    aria-label={`Select ${color} colorSwatch`}
                  />
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-xs font-bold transition flex items-center gap-1 h-8 justify-center cursor-pointer shadow-xs select-none hover:scale-[1.02] transform"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Create Label</span>
          </button>
        </form>
      </div>

      {/* 9.2 Kanban Board: DESKTOP COLUMN SYSTEM */}
      <div className="hidden md:flex gap-4 overflow-x-auto pb-4 pt-1 items-start min-h-[460px]" id="desktop-kanban">
        {boardLists.map((list) => {
          const listCards = boardCards.filter(c => c.list_name === list);
          const isDragOverThis = dragOverList === list;

          return (
            <div 
              key={list} 
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverList !== list) setDragOverList(list);
                if (dragOverCardIdx !== null) {
                  setDragOverCardIdx(null);
                  setDragOverCardPos(null);
                }
              }}
              onDragLeave={() => {
                setDragOverList(null);
              }}
              onDrop={(e) => {
                setDragOverList(null);
                handleDropOnList(e, list);
              }}
              className={`w-72 bg-slate-100 rounded-xl flex flex-col max-h-[500px] border shrink-0 transition-colors duration-150
                ${isDragOverThis 
                  ? "border-sky-500 bg-sky-50/70 ring-2 ring-sky-200" 
                  : "border-slate-200/60 shadow-sm"
                }
              `}
              id={`column-${list.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {/* Column Header */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-slate-200/50">
                {editingList === list ? (
                  <input
                    type="text"
                    required
                    autoFocus
                    className="text-xs font-extrabold text-slate-800 bg-white border border-sky-500 rounded px-1.5 py-0.5 focus:outline-none w-44 font-sans"
                    value={editingListValue}
                    onChange={(e) => setEditingListValue(e.target.value)}
                    onBlur={() => handleRenameList(list, editingListValue)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleRenameList(list, editingListValue);
                      } else if (e.key === "Escape") {
                        setEditingList(null);
                      }
                    }}
                  />
                ) : (
                  <div className="flex items-start gap-1.5 group/header min-w-0 flex-1 mr-2">
                    <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider break-words whitespace-normal text-left leading-relaxed mt-1">
                      {list}
                    </h4>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover/header:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingList(list);
                          setEditingListValue(list);
                        }}
                        className="p-1 hover:bg-slate-205 rounded text-slate-400 hover:text-sky-600 transition cursor-pointer"
                        title="Rename list name"
                        aria-label="Rename list name"
                      >
                        <Pencil className="w-3" />
                      </button>

                      <button
                        type="button"
                        disabled={boardLists.indexOf(list) === 0}
                        onClick={() => handleMoveListLeft(list)}
                        className="p-1 hover:bg-slate-205 rounded text-slate-400 hover:text-sky-600 transition disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
                        title="Move list left"
                        aria-label="Move list left"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={boardLists.indexOf(list) === boardLists.length - 1}
                        onClick={() => handleMoveListRight(list)}
                        className="p-1 hover:bg-slate-205 rounded text-slate-400 hover:text-sky-600 transition disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
                        title="Move list right"
                        aria-label="Move list right"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                <span className="bg-slate-250 text-slate-600 text-[10px] font-extrabold rounded-full px-2 py-0.5 font-sans">
                  {listCards.length}
                </span>
              </div>

              {/* Stacked Cards Area */}
              <div className="p-3 overflow-y-auto space-y-3 flex-1 scrollbar-thin">
                {listCards.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 font-medium italic border-2 border-dashed border-slate-200 rounded-lg">
                    Empty list column
                  </div>
                ) : (
                  listCards.map((card) => {
                    const originalIdx = boardCards.indexOf(card);
                    
                    // Count checklist items completed
                    const checklistTotal = card.checklist?.items?.length || 0;
                    const isDeletingThis = deletingCardIndex === originalIdx;
                    const isCurrentlyDragged = draggedCardIndex === originalIdx;
                    const isDragOverThisCard = dragOverCardIdx === originalIdx;

                    return (
                      <React.Fragment key={originalIdx}>
                        {/* Drop Indicator - Before Card */}
                        {draggedCardIndex !== null && isDragOverThisCard && dragOverCardPos === "before" && !isCurrentlyDragged && (
                          <div className="h-1 bg-sky-500 rounded-full w-full border border-sky-400 shadow-[0_0_8px_rgba(14,165,233,0.6)] animate-pulse transition-all duration-150 my-1" />
                        )}

                        <div
                          onClick={() => openEditModal(originalIdx)}
                          draggable={dragEnabledIndex === originalIdx}
                          onDragStart={(e) => handleDragStart(e, originalIdx)}
                          onDragEnd={handleDragEnd}
                          onDragOver={(e) => handleDragOverCard(e, originalIdx)}
                          onDrop={(e) => handleDropOnCard(e, originalIdx, list)}
                          className={`group relative bg-white border rounded-lg p-3.5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col space-y-2.5 cursor-pointer hover:bg-slate-50/35
                            ${isCurrentlyDragged 
                              ? "opacity-30 border-dashed border-sky-450 scale-[0.97]" 
                              : "border-slate-200/80 hover:border-slate-350"
                            }
                          `}
                        >
                          {/* Drag grip vertical handle icon - drag only possible when selecting this */}
                          <div 
                            onMouseDown={() => setDragEnabledIndex(originalIdx)}
                            onMouseUp={() => setDragEnabledIndex(null)}
                            onMouseLeave={() => setDragEnabledIndex(null)}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute left-2 top-3.5 text-slate-350 group-hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0 transition-colors select-none p-1 hover:bg-slate-100 rounded"
                            title="Drag handle"
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </div>

                          {/* 9.3 Hover Buttons overlay top right */}
                          <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(originalIdx);
                              }}
                              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-sky-600 transition cursor-pointer"
                              title="Edit card details"
                              aria-label="Edit card details"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingCardIndex(isDeletingThis ? null : originalIdx);
                              }}
                              className={`p-1 rounded transition cursor-pointer ${isDeletingThis ? "bg-rose-50 text-rose-600" : "hover:bg-rose-50 text-slate-400 hover:text-rose-600"}`}
                              title="Delete card"
                              aria-label="Delete card"
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Card Content Title with left handle padding spacer */}
                          <p className="font-bold text-xs text-slate-900 leading-snug pl-4 pr-12">
                            {card.card_title}
                          </p>

                          {/* Description Preview (if exists) */}
                          {card.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed pl-4">
                              {card.description}
                            </p>
                          )}

                          {/* Labels row list */}
                          {card.labels && card.labels.length > 0 && (
                            <div className="flex flex-wrap gap-1 pl-4">
                              {card.labels.map((lbl) => {
                                const col = getLabelColor(lbl);
                                return (
                                  <span
                                    key={lbl}
                                    style={getPillStyles(col)}
                                    className="text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                                  >
                                    {lbl}
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          {/* Badge details row */}
                          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100/50 text-[10px] text-slate-500 pl-4">
                            {/* Start Date badge if configured */}
                            {card.start_date && (
                              <span 
                                className="inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                                title="Start date configured"
                              >
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>S: {formatDateString(card.start_date)}</span>
                              </span>
                            )}

                            {/* Due Date badge */}
                            {card.due_date && (
                              <span 
                                className={`inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded border ${
                                  isPastDue(card.due_date) 
                                    ? "bg-rose-50 text-rose-600 font-bold border-rose-100" 
                                    : "bg-slate-100 text-slate-700 border-slate-200"
                                }`}
                                title={isPastDue(card.due_date) ? "Past due date!" : "Due date"}
                              >
                                <Calendar className="w-3 h-3 text-slate-450" />
                                <span>D: {formatDateString(card.due_date)}</span>
                              </span>
                            )}

                            {/* Checklist progress count badge */}
                            {card.checklist && (
                              <span className="flex items-center gap-0.5 text-slate-600 font-medium whitespace-nowrap">
                                <CheckSquare className="w-3 h-3 text-slate-400" />
                                <span>{checklistTotal} Tasks</span>
                              </span>
                            )}
                          </div>

                          {/* Delete Popover confirmation */}
                          {isDeletingThis && (
                            <div 
                              onClick={(e) => e.stopPropagation()}
                              className="absolute inset-0 bg-white/95 rounded-lg flex flex-col items-center justify-center p-3 text-center z-10 border border-rose-200 shadow-lg animate-fade-in"
                            >
                              <span className="text-[11px] font-bold text-rose-800 flex items-center gap-1 justify-center">
                                <AlertTriangle className="w-3.5 h-3.5" /> Confirm delete?
                              </span>
                              <div className="flex items-center gap-2 mt-2">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCard(originalIdx)}
                                  className="px-2.5 py-1 bg-rose-600 text-white rounded text-[10px] font-bold hover:bg-rose-700 cursor-pointer"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingCardIndex(null)}
                                  className="px-2.5 py-1 bg-slate-100 text-slate-700 border rounded text-[10px] font-semibold hover:bg-slate-200 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Drop Indicator - After Card */}
                        {draggedCardIndex !== null && isDragOverThisCard && dragOverCardPos === "after" && !isCurrentlyDragged && (
                          <div className="h-1 bg-sky-500 rounded-full w-full border border-sky-400 shadow-[0_0_8px_rgba(14,165,233,0.6)] animate-pulse transition-all duration-150 my-1" />
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </div>

              {/* Bottom add card bar */}
              <div className="p-2 border-t border-slate-200/50 bg-slate-50 rounded-b-xl">
                <button
                  type="button"
                  onClick={() => openNewCardModal(list)}
                  className="w-full py-1.5 hover:bg-slate-200/70 text-slate-600 hover:text-slate-800 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Card</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 9.2 Mobile Stacked List Accordion View */}
      <div className="block md:hidden space-y-3" id="mobile-accordion">
        {boardLists.map((list) => {
          const isExpanded = activeMobileList === list;
          const listCards = boardCards.filter(c => c.list_name === list);

          return (
            <div key={list} className="border border-slate-200 bg-white rounded-lg overflow-hidden shadow-sm">
              <div
                className="w-full px-4 py-3 flex items-center justify-between text-left font-bold text-sm text-slate-800 bg-slate-50 border-b border-slate-100"
              >
                {editingList === list ? (
                  <div className="flex items-center gap-1.5 w-full pr-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      required
                      autoFocus
                      className="text-xs font-bold text-slate-800 bg-white border border-sky-500 rounded px-1.5 py-0.5 focus:outline-none w-36 font-sans"
                      value={editingListValue}
                      onChange={(e) => setEditingListValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleRenameList(list, editingListValue);
                        } else if (e.key === "Escape") {
                          setEditingList(null);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRenameList(list, editingListValue)}
                      className="px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded text-[10px] font-bold shrink-0 cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingList(null)}
                      className="p-1 text-slate-400 hover:text-slate-600 shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group/mobile-header min-w-0 flex-1 mr-2">
                    <button
                      type="button"
                      onClick={() => setActiveMobileList(isExpanded ? null : list)}
                      className="font-extrabold text-xs text-slate-800 uppercase tracking-wider break-words whitespace-normal flex-1 text-left leading-relaxed py-1"
                    >
                      {list}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingList(list);
                        setEditingListValue(list);
                      }}
                      className="p-1 hover:bg-slate-200/50 rounded text-slate-500 hover:text-sky-600 shrink-0 cursor-pointer"
                      title="Rename list"
                      aria-label="Rename list"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      disabled={boardLists.indexOf(list) === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveListLeft(list);
                      }}
                      className="p-1 hover:bg-slate-200/50 rounded text-slate-500 hover:text-sky-600 shrink-0 disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
                      title="Move list up"
                      aria-label="Move list up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      disabled={boardLists.indexOf(list) === boardLists.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveListRight(list);
                      }}
                      className="p-1 hover:bg-slate-200/50 rounded text-slate-500 hover:text-sky-600 shrink-0 disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
                      title="Move list down"
                      aria-label="Move list down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>

                    <span className="bg-slate-200 text-slate-600 text-xs font-bold rounded-full px-2 py-0.5 whitespace-nowrap shrink-0">
                      {listCards.length}
                    </span>
                  </div>
                )}
                
                <button
                  type="button"
                  onClick={() => setActiveMobileList(isExpanded ? null : list)}
                  className="text-xs text-sky-600 font-bold hover:text-sky-800 shrink-0 select-none pl-2 ml-auto"
                >
                  {isExpanded ? "Collapse" : "Expand"}
                </button>
              </div>

              {isExpanded && (
                <div className="p-3 border-t border-slate-100 bg-slate-50/50 space-y-3">
                  {listCards.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400 font-medium italic border-2 border-dashed border-slate-200 rounded-md">
                      No cards in this column yet
                    </div>
                  ) : (
                    listCards.map((card) => {
                      const originalIdx = boardCards.indexOf(card);
                      const isDeletingThis = deletingCardIndex === originalIdx;

                      return (
                        <div 
                          key={originalIdx} 
                          onClick={() => openEditModal(originalIdx)}
                          className="bg-white border text-sm rounded-lg p-3 space-y-2 relative shadow-inner cursor-pointer hover:bg-slate-50/50"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <p className="font-bold text-xs text-slate-900 leading-tight">
                              {card.card_title}
                            </p>

                            <div className="flex items-center gap-1 shrink-0 bg-slate-50 border p-1 rounded-md" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditModal(originalIdx);
                                }}
                                className="p-1 text-slate-500 hover:text-sky-600 cursor-pointer"
                                title="Edit card"
                                aria-label="Edit card"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingCardIndex(isDeletingThis ? null : originalIdx);
                                }}
                                className="p-1 text-slate-500 hover:text-rose-600 cursor-pointer"
                                title="Delete card"
                                aria-label="Delete card"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {card.description && (
                            <p className="text-[11px] text-slate-500 break-words leading-relaxed">{card.description}</p>
                          )}

                          {card.labels && card.labels.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {card.labels.map(lbl => {
                                const col = getLabelColor(lbl);
                                return (
                                  <span key={lbl} style={getPillStyles(col)} className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                                    {lbl}
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2 pt-1 border-t text-[10px] text-slate-500 font-sans">
                            {/* Start date visual mobile badge */}
                            {card.start_date && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold bg-slate-100 text-slate-700 border border-slate-205">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>S: {formatDateString(card.start_date)}</span>
                              </span>
                            )}

                            {card.due_date && (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold border ${
                                isPastDue(card.due_date) 
                                  ? "text-rose-600 font-bold bg-rose-50 border-rose-105" 
                                  : "bg-slate-100 text-slate-700 border-slate-205"
                              }`}>
                                <Calendar className="w-3 h-3 text-slate-450" />
                                <span>D: {formatDateString(card.due_date)}</span>
                              </span>
                            )}

                            {card.checklist && (
                              <span className="flex items-center gap-1 font-medium text-slate-600 whitespace-nowrap">
                                <CheckSquare className="w-3 h-3 text-slate-400" />
                                <span>{card.checklist.items.length} Tasks</span>
                              </span>
                            )}
                          </div>

                          {isDeletingThis && (
                            <div 
                              onClick={(e) => e.stopPropagation()}
                              className="absolute inset-0 bg-white/95 rounded-lg flex flex-col items-center justify-center p-3 text-center z-10 border border-rose-200"
                            >
                              <span className="text-xs font-bold text-rose-800">Confirm delete?</span>
                              <div className="flex items-center gap-2 mt-2">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCard(originalIdx)}
                                  className="px-2.5 py-1 bg-rose-600 text-white rounded text-xs font-bold cursor-pointer"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingCardIndex(null)}
                                  className="px-2.5 py-1 bg-slate-100 border text-slate-700 rounded text-xs font-semibold cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  <button
                    type="button"
                    onClick={() => openNewCardModal(list)}
                    className="w-full py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add card to column</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 9.4 Card Editor Modal */}
      {isEditorOpen && (
        <div 
          role="dialog" 
          aria-modal="true" 
          id="editor-modal-stage"
          className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 overflow-y-auto backdrop-blur-xs"
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto border border-slate-100">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-base font-bold text-slate-800" id="modal-label">
                {editingCardIndex !== null ? "Edit Project Card Details" : "Add New Task Card"}
              </h2>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
                aria-label="Close modal dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveCard} className="p-6 space-y-4">
              
              {/* Card Title */}
              <div className="space-y-1.5">
                <label htmlFor="edit-title" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Card Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  id="edit-title"
                  value={modalFields.card_title}
                  onChange={(e) => setModalFields(prev => ({ ...prev, card_title: e.target.value }))}
                  placeholder="e.g., Define database indexing strategies"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>

              {/* List Dropdown Select */}
              <div className="space-y-1.5">
                <label htmlFor="edit-list" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                  List Destination Column <span className="text-rose-500">*</span>
                </label>
                <select
                  id="edit-list"
                  value={modalFields.list_name}
                  onChange={(e) => setModalFields(prev => ({ ...prev, list_name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
                >
                  {boardLists.map(list => (
                    <option key={list} value={list}>{list}</option>
                  ))}
                </select>
              </div>

              {/* Description Textarea */}
              <div className="space-y-1.5">
                <label htmlFor="edit-description" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Card Description (Optional)
                </label>
                <textarea
                  id="edit-description"
                  rows={3}
                  value={modalFields.description}
                  onChange={(e) => setModalFields(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Add detailed task notes or specifications..."
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-none font-sans"
                />
              </div>

              {/* Dates grid (Start Date and Due Date) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Start Date */}
                <div className="space-y-1.5">
                  <label htmlFor="edit-startdate" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Start Date
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="date"
                      id="edit-startdate"
                      value={modalFields.start_date}
                      onChange={(e) => setModalFields(prev => ({ ...prev, start_date: e.target.value }))}
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-x focus:ring-sky-500 focus:border-sky-500 font-medium"
                    />
                    {modalFields.start_date && (
                      <button
                        type="button"
                        onClick={() => setModalFields(prev => ({ ...prev, start_date: "" }))}
                        className="px-2 py-1.5 border border-slate-300 rounded-lg text-[10px] font-semibold hover:bg-slate-50 text-slate-500 cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Due Date */}
                <div className="space-y-1.5">
                  <label htmlFor="edit-duedate" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Due Date
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="date"
                      id="edit-duedate"
                      value={modalFields.due_date}
                      onChange={(e) => setModalFields(prev => ({ ...prev, due_date: e.target.value }))}
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-x focus:ring-sky-500 focus:border-sky-500 font-medium"
                    />
                    {modalFields.due_date && (
                      <button
                        type="button"
                        onClick={() => setModalFields(prev => ({ ...prev, due_date: "" }))}
                        className="px-2 py-1.5 border border-slate-300 rounded-lg text-[10px] font-semibold hover:bg-slate-50 text-slate-500 cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Labels selection group & customized label adder */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <span className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Labels Selection
                </span>
                
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-1.5 border rounded-lg bg-slate-50/50">
                  {allLabels.map((lbl) => {
                    const isChecked = modalFields.labels.includes(lbl);
                    const color = getLabelColor(lbl);
                    const pillStyles = getPillStyles(color);

                    return (
                      <label 
                        key={lbl} 
                        className="flex items-center gap-2 px-2.5 py-1.5 border bg-white rounded-md cursor-pointer hover:bg-slate-50 transition"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleLabelCheckbox(lbl)}
                          className="rounded text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                        />
                        <span 
                          style={pillStyles} 
                          className="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider truncate shrink-0 max-w-[100px]"
                        >
                          {lbl}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {/* Custom label addition input */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Some Label"
                      value={newCustomLabel}
                      onChange={(e) => setNewCustomLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomLabel(); } }}
                      className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 bg-white rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    <button
                      type="button"
                      onClick={addCustomLabel}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-bold rounded-md transition shrink-0"
                    >
                      Add Label
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap px-0.5">
                    {(Object.keys(TRELLO_COLORS) as TrelloColor[]).map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewCustomLabelColor(color)}
                        style={{ backgroundColor: TRELLO_COLORS[color] }}
                        className={`w-4 h-4 rounded-full cursor-pointer transition-all focus:outline-none ${
                          newCustomLabelColor === color
                            ? "ring-2 ring-offset-1 ring-slate-700 scale-110"
                            : "opacity-70 hover:opacity-100 hover:scale-110"
                        }`}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Structured Checklist Section */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Checklist Settings
                  </span>
                  <label className="flex items-center gap-1 text-xs text-sky-600 font-bold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={modalFields.hasChecklist}
                      onChange={(e) => setModalFields(prev => ({ ...prev, hasChecklist: e.target.checked }))}
                      className="rounded text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                    />
                    <span>Include Checklist</span>
                  </label>
                </div>

                {modalFields.hasChecklist && (
                  <div className="p-4 bg-slate-50 border rounded-lg space-y-3 animate-fade-in/75">
                    {/* Checklist title */}
                    <div className="space-y-1">
                      <label htmlFor="checklist-title-input" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Checklist Title
                      </label>
                      <input
                        type="text"
                        id="checklist-title-input"
                        placeholder="e.g., Deliverables"
                        value={modalFields.checklistTitle}
                        onChange={(e) => setModalFields(prev => ({ ...prev, checklistTitle: e.target.value }))}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 bg-white rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>

                    {/* Checklist items list */}
                    {modalFields.checklistItems.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Tasks ({modalFields.checklistItems.length})
                        </span>
                        
                        <div className="space-y-1.5 max-h-24 overflow-y-auto">
                          {modalFields.checklistItems.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-white px-2.5 py-1 border rounded text-xs text-slate-700">
                              <input
                                type="text"
                                value={item}
                                onChange={(e) => {
                                  const copy = [...modalFields.checklistItems];
                                  copy[idx] = e.target.value;
                                  setModalFields(prev => ({ ...prev, checklistItems: copy }));
                                }}
                                placeholder="Task description..."
                                className="flex-1 bg-transparent border-none p-0 text-xs focus:ring-0 focus:outline-none focus:bg-slate-50 font-medium"
                                title="Click to edit task item description"
                              />
                              <button
                                type="button"
                                onClick={() => removeChecklistItem(idx)}
                                className="text-slate-400 hover:text-rose-600 shrink-0 cursor-pointer"
                                title="Remove task item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Checklist item input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add tasks..."
                        value={newChecklistItem}
                        onChange={(e) => setNewChecklistItem(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addChecklistItem();
                          }
                        }}
                        className="flex-1 px-2.5 py-1 text-xs border border-slate-300 bg-white rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                      <button
                        type="button"
                        onClick={addChecklistItem}
                        className="px-3 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-bold rounded"
                      >
                        Add Task
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-sm font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-bold transition shadow-sm cursor-pointer"
                >
                  Save Card
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
