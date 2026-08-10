/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { Upload, Sparkles, ChevronDown, ChevronUp, FileCode, AlertCircle, Loader2 } from "lucide-react";
import type { Card, TrelloColor } from "../types";
import { validateJson } from "../api";

interface Step1InputProps {
  onValidated: (result: {
    cards: Card[];
    lists: string[];
    labels: { name: string; default_color: TrelloColor }[];
  }) => void;
  showToast: (message: string, type: "success" | "error" | "info") => void;
}

export default function Step1Input({ onValidated, showToast }: Step1InputProps) {
  const [activeTab, setActiveTab] = useState<"upload" | "ai">("upload");
  const [isDragActive, setIsDragActive] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aiPrompt, setAiPrompt] = useState("");

  // Handle Drag Events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    setValidationError(null);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      await processSelectedFile(files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError(null);
    const files = e.target.files;
    if (files && files[0]) {
      await processSelectedFile(files[0]);
    }
  };

  const processSelectedFile = async (file: File) => {
    // 1. Check size limit: Maximum file size: 1 MB
    const oneMB = 1024 * 1024;
    if (file.size > oneMB) {
      setValidationError("File is too large. Maximum supported size is 1 MB.");
      showToast("File exceeds 1 MB limit", "error");
      return;
    }

    // 2. Client-side extension validation
    if (!file.name.endsWith(".json") && file.type !== "application/json") {
      setValidationError("Only .json files are accepted.");
      showToast("Invalid file type", "error");
      return;
    }

    setIsValidating(true);
    try {
      const res = await validateJson(file);
      if (res.valid && res.cards) {
        showToast(`Successfully validated ${res.card_count} cards!`, "success");
        onValidated({
          cards: res.cards,
          lists: res.lists,
          labels: res.labels,
        });
      } else {
        setValidationError(res.error || "Validation failed on server.");
        showToast("JSON validation failed", "error");
      }
    } catch (err: any) {
      setValidationError(err.message || "An unexpected error occurred during processing.");
      showToast("Error processing file", "error");
    } finally {
      setIsValidating(false);
    }
  };

  const triggerBrowse = () => {
    fileInputRef.current?.click();
  };

  const handleAiGenerateClick = (e: React.FormEvent) => {
    e.preventDefault();
    showToast("AI generation is coming soon. Upload a JSON file for now.", "info");
  };

  const jsonSample = `[
  {
    "list_name": "To Do",
    "card_title": "My first card",
    "description": "A short description",
    "labels": ["Low", "Medium"],
    "due_date": "2026-08-01",
    "checklist": {
      "title": "Tasks",
      "items": ["Item one", "Item two"]
    }
  }
]`;

  return (
    <div id="step1-container" className="w-full max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden animate-fade-in">
      
      {/* Step Header */}
      <div className="p-6 bg-slate-50 border-b border-slate-200">
        <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
          <FileCode className="w-5.5 h-5.5 text-sky-600 shrink-0" />
          <span>Import or Describe Kanban Board Structure</span>
        </h2>
        <p className="text-xs text-slate-500 font-medium mt-1.5 leading-relaxed">
          Provide your Trello cards configuration. Upload an existing JSON workspace file below, or describe your project layout to generate templates.
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200" id="step1-tabs">
          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`flex-1 py-3 text-center font-semibold text-xs sm:text-sm border-b-2 transition-all flex items-center justify-center gap-2 ${
              activeTab === "upload"
                ? "border-sky-600 text-sky-600 font-bold"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
            aria-label="Upload JSON file tab"
          >
            <FileCode className="w-4 h-4" />
            <span>Upload JSON File</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ai")}
            className={`flex-1 py-3 text-center font-semibold text-xs sm:text-sm border-b-2 transition-all flex items-center justify-center gap-2 ${
              activeTab === "ai"
                ? "border-sky-600 text-sky-600 font-bold"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
            aria-label="Generate board with AI tab"
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Generate with AI Assist</span>
            <span className="text-[9px] bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-extrabold uppercase tracking-wider scale-90 sm:scale-100 shrink-0">
              Coming Soon
            </span>
          </button>
        </div>

        {/* Tab Contents: Upload JSON */}
        {activeTab === "upload" && (
          <div id="upload-panel" className="space-y-4">
            <div
              id="drop-zone"
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={triggerBrowse}
              className={`
                border-2 border-dashed rounded-xl p-8 sm:p-10 flex flex-col items-center justify-center space-y-4 text-center cursor-pointer transition-all duration-200 min-h-[220px]
                ${isDragActive 
                  ? "border-sky-500 bg-sky-50" 
                  : "border-slate-300 bg-slate-50/20 hover:border-sky-400 hover:bg-slate-50"
                }
              `}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
                aria-label="FileInput"
              />
              
              {isValidating ? (
                <div className="flex flex-col items-center space-y-3 p-4">
                  <Loader2 className="w-10 h-10 text-sky-600 animate-spin" />
                  <p className="text-xs sm:text-sm font-semibold text-slate-600">Validating and parsing cards...</p>
                </div>
              ) : (
                <>
                  <div className="p-3.5 bg-sky-50 text-sky-600 rounded-full shadow-sm">
                    <Upload className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-950">
                      Drag and drop your <code className="bg-slate-100 px-1.5 py-0.5 rounded text-rose-650 text-xs font-mono border border-slate-200 shadow-xs">cards.json</code> file
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">or click anywhere inside this box to browse local files on your computer</p>
                  </div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Accepts only valid <code className="font-mono lowercase text-[11px]">.json</code> format • Limit 1 MB
                  </div>
                </>
              )}
            </div>

            {/* Validation Error Banner */}
            {validationError && (
              <div 
                role="alert" 
                id="upload-error" 
                className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-start gap-3 shadow-sm animate-fade-in"
              >
                <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-bold text-sm text-rose-955">JSON Schema Integrity Warning</h4>
                  <p className="text-xs mt-1 font-mono break-all whitespace-pre-wrap leading-relaxed text-rose-800">{validationError}</p>
                </div>
              </div>
            )}

            {/* Accordion Guide */}
            <div id="format-guide-accordion" className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                className="w-full px-5 py-4 flex items-center justify-between text-left font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100/70 focus:outline-none transition-colors"
                aria-expanded={isAccordionOpen}
              >
                <span className="text-xs sm:text-sm font-bold text-slate-800">What format does the JSON need to be?</span>
                {isAccordionOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
              </button>
              
              {isAccordionOpen && (
                <div className="px-5 py-4 border-t border-slate-200 bg-slate-50/50 space-y-4">
                  <div className="space-y-1 text-xs text-slate-600 leading-relaxed">
                    <p className="font-bold text-slate-800">Format Rules & Schema:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Must be a top-level JSON array of card objects.</li>
                      <li><code className="bg-white border rounded px-1.5 py-0.5 font-mono text-rose-650 text-[11px] font-bold">list_name</code> and <code className="bg-white border rounded px-1.5 py-0.5 font-mono text-rose-650 text-[11px] font-bold">card_title</code> are strictly required.</li>
                      <li>Other fields (<code className="font-mono">description</code>, <code className="font-mono">labels</code>, <code className="font-mono">due_date</code>, and <code className="font-mono">checklist</code>) are optional.</li>
                      <li>Any objects with keys starting with <code className="font-mono">_comment</code> or <code className="font-mono">_rules</code> are automatically skipped as notes.</li>
                      <li>Maximum allowed file size is 1 MB.</li>
                    </ul>
                  </div>

                  <div className="relative">
                    <div className="absolute top-2 right-2 text-[10px] font-mono text-slate-400 font-bold tracking-wider select-none bg-slate-900/15 px-1.5 py-0.5 rounded">
                      Structure Sample
                    </div>
                    <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 font-mono text-[11px] overflow-x-auto shadow-inner leading-relaxed">
                      {jsonSample}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab Contents: AI Prompt Planner */}
        {activeTab === "ai" && (
          <form onSubmit={handleAiGenerateClick} id="ai-generation-panel" className="p-5 sm:p-6 bg-slate-50/40 border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-violet-100 text-violet-700 rounded-lg shadow-xs">
                <Sparkles className="w-5.5 h-5.5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">Generate Board via Plaintext Prompt</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Describe your workflow workspace setup in English, and an embedded LLM assistant can blueprint layout stages, auto-populate checklist items, and export valid board definitions.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="ai-prompt-input" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Describe desired lanes or user stories
              </label>
              <textarea
                id="ai-prompt-input"
                rows={4}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe your board (e.g. 'A 2-week sprint for a mobile payments feature. Setup backlog, review security checklist, define DB schemes and run payment testing')"
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all resize-none"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <span className="text-[10px] text-violet-700 font-bold bg-violet-50 px-2.5 py-1 rounded-full border border-violet-100 inline-flex items-center gap-1 w-max">
                ⚡ Gemini Assistant
              </span>

              <div className="relative group w-full sm:w-auto">
                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-300 text-slate-500 rounded-lg font-bold text-xs uppercase tracking-wider cursor-not-allowed transition"
                  disabled
                >
                  Generate board
                </button>
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 text-slate-100 text-[10px] px-2.5 py-1.5 rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-30 pointer-events-none font-medium">
                  AI prompt parser is coming soon. Please upload a JSON.
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
