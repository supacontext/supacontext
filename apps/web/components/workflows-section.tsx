"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const agents = [
  {
    id: "coding",
    title: "Coding agents",
    description:
      "Pull current docs, release notes, GitHub issues, and developer threads before the agent writes code or fixes a bug.",
  },
  {
    id: "research",
    title: "Research agents",
    description:
      "Collect cited signals from the web, Reddit, X, and YouTube so the agent can compare sources and hand off a clean brief.",
  },
  {
    id: "content",
    title: "Content agents",
    description:
      "Find what your audience asks, watches, and debates, then give the agent cited inputs for timely content.",
  },
  {
    id: "sales",
    title: "Sales agents",
    description:
      "Gather account news, buyer pain points, competitor mentions, and market signals before the agent writes outreach.",
  },
];

const AUTO_ADVANCE_MS = 5000;

export function WorkflowsSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isHovered) return;

    const interval = 50;
    const step = (interval / AUTO_ADVANCE_MS) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + step;
        return next >= 100 ? 100 : next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [isHovered, activeIndex]);

  useEffect(() => {
    if (progress < 100) {
      return;
    }

    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % agents.length);
      setProgress(0);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [progress]);

  const handleManualClick = (index: number) => {
    setActiveIndex(index);
    setProgress(0);
  };

  return (
    <section className="section workflowsSection" aria-label="Context for real agent workflows">
      <div className="workflowsSplit">
        <div className="workflowsCopy">
          <h2 className="workflowsHeading">Context for real agent workflows</h2>
          <p className="mutedText">
            Give agents one API for Web, Reddit, X, and YouTube context, gathered autonomously,
            returned as JSON.
          </p>
          <div className="workflowsCTA">
            <Link className="button primaryButton" href="/dashboard">
              Start Free
              <span className="buttonDivider" aria-hidden="true" />
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </div>

        <div
          className="workflowsAccordionWrapper"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {agents.map((agent, index) => {
            const isActive = index === activeIndex;

            return (
              <div
                key={agent.id}
                className={`workflowAccordionCard ${isActive ? "active" : ""}`}
                onClick={() => handleManualClick(index)}
                role="button"
                tabIndex={0}
                aria-expanded={isActive}
              >
                <div className="workflowAccordionHeader">
                  <span className="workflowNumber">0{index + 1}</span>
                  <h3 className="workflowTitle">{agent.title}</h3>
                </div>

                <div
                  className="workflowAccordionContent"
                  style={{
                    gridTemplateRows: isActive ? "1fr" : "0fr",
                  }}
                >
                  <div className="workflowAccordionInner">
                    <p>{agent.description}</p>
                  </div>
                </div>

                <div className="workflowProgressTrack">
                  <div
                    className="workflowProgressBar"
                    style={{
                      width: isActive ? `${progress}%` : "0%",
                      transition: isActive && progress > 0 ? "width 50ms linear" : "none",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
