/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import StepIndicator from "./components/StepIndicator";
import Step1Input from "./components/Step1Input";
import Step2Preview from "./components/Step2Preview";
import Step3Configure from "./components/Step3Configure";
import Step4Build from "./components/Step4Build";
import { buildBoard, streamLogs } from "./api";
import type { Card, TrelloColor } from "./types";
import { AnimatePresence, motion } from "motion/react";
import { Kanban, Sparkles, CheckSquare, Settings, AlertCircle, Check, Info, X } from "lucide-react";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

export default function App() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Raw list of parsed cards (Step 2 displays and mutates this)
  const [cards, setCards] = useState<Card[]>([]);
  const [lists, setLists] = useState<string[]>([]);
  
  // Custom or default mapped labels returning from validate-json
  const [defaultLabels, setDefaultLabels] = useState<{ name: string; default_color: TrelloColor }[]>([]);
  
  // Choose Colors Mapping (name -> selected Trello color)
  const [labelColors, setLabelColors] = useState<Record<string, TrelloColor>>({});

  // Credentials & Settings cached states
  const [boardName, setBoardName] = useState("");
  const [boardDescription, setBoardDescription] = useState("");
  const [permissionLevel, setPermissionLevel] = useState<"private" | "org" | "public">("private");
  const [createIfNotExists, setCreateIfNotExists] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");

  // Build Stream States (Step 4)
  const [jobId, setJobId] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [buildStatus, setBuildStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [boardUrl, setBoardUrl] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  // Floating Toast State Engine
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Callback triggered when Step 1 validation completes
  const handleStep1Validated = (result: {
    cards: Card[];
    lists: string[];
    labels: { name: string; default_color: TrelloColor }[];
  }) => {
    setCards(result.cards);
    setLists(result.lists);
    setDefaultLabels(result.labels);

    // Default label color assignments
    const initialColorsMapping: Record<string, TrelloColor> = {};
    result.labels.forEach((lbl) => {
      initialColorsMapping[lbl.name] = lbl.default_color;
    });
    setLabelColors(initialColorsMapping);
    
    // Set a sensible default board name if empty
    if (result.cards.length > 0) {
      setBoardName("Sprint Board Planner");
    }

    setStep(2);
  };

  // Backwards navigation handlers
  const handleStepClick = (target: 1 | 2 | 3) => {
    if (target < step) {
      setStep(target);
    }
  };

  // Step 2 Completion Callback
  const handleStep2Finished = (updatedCards: Card[], updatedLists: string[], updatedLabelColors?: Record<string, TrelloColor>) => {
    setCards(updatedCards);
    setLists(updatedLists);
    if (updatedLabelColors) {
      setLabelColors(updatedLabelColors);
    }
    setStep(3);
  };

  // Step 3 build submission trigger
  const handleStep3SubmitBuild = async (settings: {
    boardName: string;
    boardDescription: string;
    permissionLevel: "private" | "org" | "public";
    createIfNotExists: boolean;
    apiKey: string;
    token: string;
    labelColors: Record<string, TrelloColor>;
  }) => {
    // Save settings locally
    setBoardName(settings.boardName);
    setBoardDescription(settings.boardDescription);
    setPermissionLevel(settings.permissionLevel);
    setCreateIfNotExists(settings.createIfNotExists);
    setApiKey(settings.apiKey);
    setToken(settings.token);
    setLabelColors(settings.labelColors);

    // Progress list body formats matching Step 4 specs
    const labelRules = Object.entries(settings.labelColors).map(([name, color]) => ({
      name,
      color,
    }));

    const buildPayload = {
      api_key: settings.apiKey,
      token: settings.token,
      board_name: settings.boardName,
      board_description: settings.boardDescription,
      permission_level: settings.permissionLevel,
      create_if_not_exists: settings.createIfNotExists,
      lists: lists,
      labels: labelRules,
      cards: cards,
    };

    setStep(4);
    setLogLines([]);
    setBuildStatus("running");
    setBuildError(null);
    setBoardUrl(null);

    try {
      const response = await buildBoard(buildPayload);
      setJobId(response.job_id);

      // Start streaming SSE logs
      streamLogs(
        response.job_id,
        (line) => {
          setLogLines((prev) => [...prev, line]);
        },
        (doneResult) => {
          if (doneResult.status === "success") {
            setBuildStatus("success");
            setBoardUrl(doneResult.board_url || "https://trello.com");
            showToast("Trello board created successfully!", "success");
          } else {
            setBuildStatus("error");
            setBuildError(doneResult.message || "An error occurred during build pipeline.");
            showToast("Trello Board build script failed", "error");
          }
        }
      );
    } catch (err: any) {
      setBuildStatus("error");
      setBuildError(err.message || "Failed to contact build microservice pipeline.");
      showToast("Trello pipeline failed", "error");
    }
  };

  // Reset entire form back to Step 1
  const handleResetToStep1 = () => {
    setCards([]);
    setLists([]);
    setDefaultLabels([]);
    setLabelColors({});
    setBoardName("");
    setBoardDescription("");
    setPermissionLevel("private");
    setCreateIfNotExists(true);
    setApiKey("");
    setToken("");
    setJobId(null);
    setLogLines([]);
    setBuildStatus("idle");
    setBoardUrl(null);
    setBuildError(null);
    setStep(1);
    showToast("Application re-initialized", "info");
  };

  // Extract non-comment unique label names
  const allLabelNames = useMemo(() => {
    const listLabels = new Set<string>();
    defaultLabels.forEach((l) => listLabels.add(l.name));
    cards.forEach((c) => c.labels.forEach((l) => listLabels.add(l)));
    return Array.from(listLabels);
  }, [defaultLabels, cards]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col selection:bg-sky-100 selection:text-sky-900 leading-normal">
      
      {/* Visual Header Branding Bar */}
      <header className="bg-white border-b border-slate-200/85 shadow-xs sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-600 text-white rounded-lg shadow-sm">
              <Kanban className="w-5.5 h-5.5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                Trello Board Builder
              </h1>
              <p className="text-xs text-slate-500 font-medium hidden sm:block">Automated Kanban schemas provisioning &amp; validation</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 border border-emerald-100 rounded-full flex items-center gap-1 shrink-0">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span>Standalone Simulator</span>
            </span>
            <span className="text-[10px] text-slate-400 font-bold hidden lg:block uppercase tracking-wider select-none bg-slate-100 px-2 py-0.5 border rounded">
              v1.0 API Checked
            </span>
          </div>
        </div>
      </header>

      {/* Primary Container layout area */}
      <main className="flex-grow max-w-6xl w-full mx-auto px-4 py-8 flex flex-col justify-start">
        
        {/* Step Indicator */}
        <StepIndicator currentStep={step} onStepClick={handleStepClick} />

        {/* Step screen router with container constraints */}
        <div className="w-full">
          {step === 1 && (
            <Step1Input 
              onValidated={handleStep1Validated} 
              showToast={showToast} 
            />
          )}

          {step === 2 && (
            <Step2Preview
              cards={cards}
              lists={lists}
              labelColors={labelColors}
              defaultLabels={defaultLabels}
              onBack={() => setStep(1)}
              onNext={handleStep2Finished}
              showToast={showToast}
            />
          )}

          {step === 3 && (
            <Step3Configure
              cardsCount={cards.length}
              listsCount={lists.length}
              labelNames={allLabelNames}
              initialLabelColors={labelColors}
              onBack={() => setStep(2)}
              onBuild={handleStep3SubmitBuild}
              showToast={showToast}
              cards={cards}
              lists={lists}
            />
          )}

          {step === 4 && (
            <Step4Build
              jobId={jobId}
              logStrings={logLines}
              buildStatus={buildStatus}
              boardUrl={boardUrl}
              buildError={buildError}
              onResetToStep1={handleResetToStep1}
              onBackToStep3={() => setStep(3)}
            />
          )}
        </div>
      </main>

      {/* Decorative footer */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-12 text-center text-xs text-slate-400 font-medium">
        <p>&copy; 2026 Trello Board Builder • Powered by React, Tailwind &amp; Gemini Flash.</p>
      </footer>

      {/* Floating Animated Custom Toasts Notification System */}
      <div 
        id="toast-container" 
        className="fixed bottom-5 right-5 space-y-2.5 z-50 w-full max-w-[340px] px-4 pointer-events-none"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
              className="pointer-events-auto"
            >
              <div 
                role="alert" 
                className={`
                  p-3.5 rounded-xl border shadow-xl flex items-start gap-2.5 text-xs bg-white text-slate-800 font-medium
                  ${t.type === "success" 
                    ? "border-emerald-200 shadow-emerald-100/40 bg-emerald-50/10 text-slate-900" 
                    : t.type === "error" 
                      ? "border-rose-200 shadow-rose-100/40 bg-rose-50/10 text-slate-900" 
                      : "border-sky-200 shadow-sky-100/40 bg-sky-50/10 text-slate-900"
                  }
                `}
              >
                {t.type === "success" && (
                  <div className="p-1 bg-emerald-100 text-emerald-800 rounded-lg shrink-0">
                    <Check className="w-3.5 h-3.5 font-extrabold stroke-[3]" />
                  </div>
                )}
                {t.type === "error" && (
                  <div className="p-1 bg-rose-100 text-rose-800 rounded-lg shrink-0">
                    <AlertCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                )}
                {t.type === "info" && (
                  <div className="p-1 bg-sky-100 text-sky-800 rounded-lg shrink-0">
                    <Info className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                )}

                <div className="flex-1 pr-2 pt-0.5 leading-snug">
                  {t.message}
                </div>

                <button 
                  type="button" 
                  onClick={() => removeToast(t.id)} 
                  className="text-slate-400 hover:text-slate-600 transition p-0.5"
                  aria-label="Dismiss toast notification"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

    </div>
  );
}
