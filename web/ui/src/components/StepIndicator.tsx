/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Check } from "lucide-react";

interface StepIndicatorProps {
  currentStep: 1 | 2 | 3 | 4;
  onStepClick: (step: 1 | 2 | 3) => void;
}

export default function StepIndicator({ currentStep, onStepClick }: StepIndicatorProps) {
  const steps = [
    { id: 1, title: "Input", desc: "Upload JSON" },
    { id: 2, title: "Preview", desc: "Kanban Board & Edit" },
    { id: 3, title: "Configure", desc: "Trello & Settings" },
    { id: 4, title: "Build", desc: "Run Pipeline & Logs" },
  ];

  return (
    <nav aria-label="Progress Stepper" id="step-nav" className="w-full max-w-4xl mx-auto mb-16 md:mb-20 pb-2 px-4">
      <ol className="flex items-center justify-between w-full relative">
        {/* Background line behind steps */}
        <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-200 -translate-y-1/2 z-0" />
        
        {/* Active progress line */}
        <div 
          className="absolute top-1/2 left-0 h-1 bg-sky-600 -translate-y-1/2 z-0 transition-all duration-300"
          style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
        />

        {steps.map((step) => {
          const isCompleted = step.id < currentStep;
          const isActive = step.id === currentStep;
          const isClickable = step.id < currentStep;

          return (
            <li 
              key={step.id} 
              className="z-10 flex flex-col items-center relative"
              aria-current={isActive ? "step" : undefined}
            >
              <button
                type="button"
                onClick={() => isClickable && onStepClick(step.id as any)}
                disabled={!isClickable}
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-200
                  ${isCompleted 
                    ? "bg-sky-600 text-white hover:bg-sky-700 cursor-pointer shadow-sm" 
                    : isActive 
                      ? "bg-sky-100 border-2 border-sky-600 text-sky-800 ring-4 ring-sky-50 shadow-md" 
                      : "bg-white border-2 border-gray-300 text-gray-400 cursor-not-allowed"
                  }
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500
                `}
                title={isClickable ? `Go back to Step ${step.id}: ${step.title}` : `Step ${step.id}: ${step.title}`}
                aria-label={`Step ${step.id}: ${step.title}`}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
                ) : (
                  <span>{step.id}</span>
                )}
              </button>

              {/* Labels shown on medium/large screens and hidden on compact mobile devices */}
              <div className="mt-2 text-center absolute top-10 whitespace-nowrap">
                <span className={`block text-xs font-semibold sm:text-sm ${
                  isActive ? "text-sky-900 font-bold" : isCompleted ? "text-sky-700 font-medium" : "text-gray-400"
                } hidden md:block`}>
                  {step.title}
                </span>
                <span className="block text-[10px] text-gray-500 hidden lg:block">
                  {step.desc}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      {/* Mobile visible step title banner */}
      <div className="md:hidden text-center mt-6">
        <span className="text-xs font-bold text-sky-800 uppercase tracking-wider">
          Currently on Step {currentStep}: {steps[currentStep - 1].title}
        </span>
        <span className="block text-[11px] text-gray-500">
          {steps[currentStep - 1].desc}
        </span>
      </div>
    </nav>
  );
}
