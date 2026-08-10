/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from "react";
import { Terminal, CheckCircle2, AlertOctagon, RefreshCcw, ArrowLeft, ExternalLink, Loader2 } from "lucide-react";

interface Step4BuildProps {
  jobId: string | null;
  logStrings: string[];
  buildStatus: "idle" | "running" | "success" | "error";
  boardUrl: string | null;
  buildError: string | null;
  onResetToStep1: () => void;
  onBackToStep3: () => void;
}

interface ParsedLine {
  time?: string;
  level: "INFO" | "SUCCESS" | "ERROR" | "WARNING";
  message: string;
}

export default function Step4Build({
  jobId,
  logStrings,
  buildStatus,
  boardUrl,
  buildError,
  onResetToStep1,
  onBackToStep3
}: Step4BuildProps) {

  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of logistics terminal on change
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logStrings]);

  // Parse custom styled text strings (e.g. "12:34:56 | INFO    | Connecting to Trello API...")
  const parseLogLine = (rawLine: string): ParsedLine => {
    const parts = rawLine.split("|");
    if (parts.length >= 3) {
      const time = parts[0].trim();
      const levelRaw = parts[1].trim().toUpperCase();
      const message = parts.slice(2).join("|").trim();

      let level: "INFO" | "SUCCESS" | "ERROR" | "WARNING" = "INFO";
      if (levelRaw.includes("SUCCESS")) level = "SUCCESS";
      else if (levelRaw.includes("ERROR") || levelRaw.includes("FAIL")) level = "ERROR";
      else if (levelRaw.includes("WARN")) level = "WARNING";

      return { time, level, message };
    } else {
      let level: "INFO" | "SUCCESS" | "ERROR" | "WARNING" = "INFO";
      const valLowerCase = rawLine.toLowerCase();
      if (valLowerCase.includes("success")) level = "SUCCESS";
      else if (valLowerCase.includes("error") || valLowerCase.includes("fail")) level = "ERROR";
      else if (valLowerCase.includes("warn")) level = "WARNING";

      return { level, message: rawLine };
    }
  };

  const getLevelColor = (level: "INFO" | "SUCCESS" | "ERROR" | "WARNING") => {
    switch (level) {
      case "SUCCESS": return "text-emerald-400 font-bold";
      case "ERROR": return "text-rose-500 font-bold";
      case "WARNING": return "text-amber-400 font-medium";
      default: return "text-cyan-400";
    }
  };

  return (
    <div id="step4-container" className="w-full max-w-3xl mx-auto space-y-6">
      
      {/* Build header details */}
      <div className="bg-white border rounded-xl p-5 shadow-sm flex items-center justify-between">
        <div className="space-y-1">
          <span className="text-xs uppercase font-extrabold text-slate-400 tracking-wider">Pipeline session</span>
          <h3 className="text-base font-bold text-slate-900 leading-none">
            {buildStatus === "running" ? "Building Trello Board..." : buildStatus === "success" ? "Pipeline Complete" : "Pipeline Failed"}
          </h3>
          <p className="text-xs text-slate-550 pt-0.5">
            Job ID: <code className="bg-slate-100 px-1.5 py-0.5 font-mono rounded text-slate-700 text-[11px] font-bold">{jobId || "assigning..."}</code>
          </p>
        </div>

        {buildStatus === "running" && (
          <div className="flex items-center gap-2 text-sky-600 bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-100">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span className="text-xs font-bold">Executing pipeline...</span>
          </div>
        )}
      </div>

      {/* 12.2 LOG PANEL TERMINAL DOCK */}
      <div 
        className="relative bg-gray-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col"
        role="log"
        aria-live={buildStatus === "running" ? "assertive" : "polite"}
      >
        <div className="bg-gray-950 px-4 py-2.5 border-b border-gray-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs font-mono font-semibold text-slate-400">Terminal - live_trello_pipeline.sh</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-rose-500/80 rounded-full" />
            <span className="w-2.5 h-2.5 bg-amber-500/80 rounded-full" />
            <span className="w-2.5 h-2.5 bg-emerald-500/80 rounded-full" />
          </div>
        </div>

        {/* Live log stream viewer */}
        <div className="p-4 bg-gray-900 font-mono text-xs overflow-y-auto h-[320px] space-y-2 scrollbar-thin scrollbar-thumb-slate-800">
          {logStrings.length === 0 ? (
            <div className="text-slate-500 py-12 text-center">
              <span>Initializing workspace terminal stream...</span>
            </div>
          ) : (
            logStrings.map((raw, idx) => {
              const parsed = parseLogLine(raw);
              return (
                <div key={idx} className="leading-relaxed hover:bg-white/5 px-1 py-0.5 rounded transition">
                  {parsed.time && (
                    <span className="text-slate-500 select-none mr-2">
                      [{parsed.time}]
                    </span>
                  )}
                  <span className={`inline-block mr-2 select-none uppercase tracking-wider text-[10px] bg-white/5 border border-white/10 px-1 py-0.5 rounded font-extrabold ${getLevelColor(parsed.level)}`}>
                    {parsed.level}
                  </span>
                  <span className={parsed.level === "SUCCESS" ? "text-emerald-350 font-semibold" : parsed.level === "ERROR" ? "text-rose-450 font-semibold" : "text-slate-200"}>
                    {parsed.message}
                  </span>
                </div>
              );
            })
          )}

          {/* Flash Pulsing cursor */}
          {buildStatus === "running" && (
            <div className="flex items-center gap-1 select-none pt-1">
              <span className="w-2 h-4 bg-green-400/90 animate-pulse inline-block" />
              <span className="text-slate-505 text-[10px] animate-pulse">awaiting events...</span>
            </div>
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* 12.3 Success state view banner */}
      {buildStatus === "success" && (
        <div id="build-success-banner" className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 animate-fade-in">
          <div className="flex items-start gap-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-bold text-slate-900 text-sm sm:text-base">Board created successfully!</h4>
              <p className="text-xs text-slate-600">Your Trello lists, custom labels and cards are fully populated inside the new workspace.</p>
              
              {boardUrl && (
                <a 
                  href={boardUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-sky-700 hover:text-sky-900 font-extrabold underline pt-1"
                >
                  <span>Open Trello board</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onResetToStep1}
            className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
            aria-label="Build another board reset trigger"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            <span>Build Another Board</span>
          </button>
        </div>
      )}

      {/* 12.4 Error state view banner */}
      {buildStatus === "error" && (
        <div id="build-error-banner" className="bg-rose-50 border border-rose-200 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 animate-fade-in/75">
          <div className="flex items-start gap-4">
            <AlertOctagon className="w-10 h-10 text-rose-500 shrink-0 mt-0.5" />
            <div className="space-y-1 w-full max-w-md">
              <h4 className="font-bold text-slate-900 text-sm sm:text-base">Build failed</h4>
              <p className="text-xs text-slate-600">The build script process terminated because of an error.</p>
              
              <div className="p-3 bg-rose-100/50 border border-rose-200/50 rounded-lg max-h-24 overflow-y-auto mt-2 select-text">
                <pre className="font-mono text-[10px] text-rose-800 whitespace-pre-wrap leading-relaxed">
                  {buildError || "Trello connection lost or invalid credentials provided. Status SSE ended prematurely."}
                </pre>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onBackToStep3}
            className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-100 text-xs font-bold rounded-lg shadow-sm transition shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
            aria-label="Return back and fix configurations"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Go Back & Retry</span>
          </button>
        </div>
      )}

    </div>
  );
}
