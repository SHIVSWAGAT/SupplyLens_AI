import { useEffect, useMemo, useRef } from "react";
import ChatMessage from "./ChatMessage.jsx";
import InputBar from "./InputBar.jsx";
import QuickActions from "./QuickActions.jsx";
import NexusOrb from "./NexusOrb.jsx";
import TypingIndicator from "./TypingIndicator.jsx";

function mapAppMessagesToNexus(messages) {
  return messages.map((m, i) => ({
    id: `msg-${i}-${m.role}`,
    role: m.role === "assistant" ? "ai" : "user",
    text: m.content ?? "",
    insights: m.insights,
    timestamp: m.createdAt != null ? new Date(m.createdAt) : null,
  }));
}

export default function NexusAssistantPanel({
  open,
  onClose,
  messages,
  onSendMessage,
  thinking,
  stats,
}) {
  const bottomRef = useRef(null);
  const nexusMessages = useMemo(() => mapAppMessagesToNexus(messages), [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const handleSend = (text) => {
    onSendMessage(text);
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          role="presentation"
        />
      )}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col"
        style={{
          width: "clamp(300px, 380px, 100vw)",
          background: "rgba(6, 11, 30, 0.92)",
          backdropFilter: "blur(32px) saturate(180%)",
          WebkitBackdropFilter: "blur(32px) saturate(180%)",
          borderLeft: "1px solid rgba(56,189,248,0.14)",
          boxShadow: open
            ? "-12px 0 60px rgba(14,165,233,0.07), -2px 0 0 rgba(99,102,241,0.12)"
            : "none",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div
          className="px-5 pt-5 pb-4 shrink-0"
          style={{ borderBottom: "1px solid rgba(56,189,248,0.08)" }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <NexusOrb size={40} active />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white">Nexus AI Assistant</h2>
                  <div
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                    style={{
                      background: "rgba(20,184,166,0.12)",
                      border: "1px solid rgba(20,184,166,0.25)",
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-teal-400"
                      style={{ animation: "nexusPulse 2s ease-in-out infinite" }}
                    />
                    <span className="text-[10px] text-teal-400 font-medium">Active</span>
                  </div>
                </div>
                <p className="text-xs text-white/30 mt-0.5">Live shipments, alerts, ML risk, and route tools</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center
                text-white/25 hover:text-white/60 hover:bg-white/5
                transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex gap-3 mt-4">
            {[
              { label: "Shipments", value: stats.shipments },
              { label: "Alerts", value: stats.alerts },
              { label: "Risk Idx", value: stats.riskIdx },
            ].map((s) => (
              <div
                key={s.label}
                className="flex-1 rounded-lg px-2.5 py-2 text-center"
                style={{
                  background: "rgba(10, 18, 45, 0.9)",
                  border: "1px solid rgba(56,189,248,0.08)",
                }}
              >
                <div className="text-base font-bold text-white">{s.value}</div>
                <div className="text-[10px] text-white/25">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div
          className="flex-1 overflow-y-auto py-3"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(56,189,248,0.1) transparent",
          }}
        >
          {nexusMessages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {thinking ? <TypingIndicator /> : null}
          <div ref={bottomRef} />
        </div>
        <div style={{ borderTop: "1px solid rgba(56,189,248,0.06)" }} className="pt-3">
          <QuickActions onSelect={handleSend} disabled={thinking} />
        </div>
        <InputBar onSend={handleSend} disabled={thinking} />
      </div>
    </>
  );
}
