"use client";

import { Activity, ArrowUp, ChevronDown, LayoutDashboard, Percent, Square, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/agent/Markdown";
import { toolLabel } from "@/lib/client/format";
import { useDataStore, type ChatMessage } from "@/lib/client/data-store";
import type { DashboardPage, MoveType, PersonaId, UiAction } from "@/lib/types";
import "./chat.css";

export interface CarChatProps {
  personaId: PersonaId;
  isLease: boolean;
  /** The agent asked to take the user somewhere (also from the "Open …" chip in a message). */
  onOpenPage(page: DashboardPage, issue?: string): void;
  /** The agent pointed at a move: the dashboard may highlight the matching alert. */
  onOpenMove?(moveType: MoveType): void;
}

const NO_MESSAGES: ChatMessage[] = [];

export function CarChat({ personaId, isLease, onOpenPage, onOpenMove }: CarChatProps) {
  const messages = useDataStore((s) => s.chat[personaId]) ?? NO_MESSAGES;
  const streaming = useDataStore((s) => s.streaming);
  const send = useDataStore((s) => s.send);
  const stop = useDataStore((s) => s.stop);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const handled = useRef(new Set<string>());

  // Carry out navigation the agent asked for, once per action.
  useEffect(() => {
    for (const message of messages) {
      message.actions.forEach((action, index) => {
        const key = `${message.id}:${index}`;
        if (handled.current.has(key)) return;
        handled.current.add(key);
        if (action.kind === "open_page") onOpenPage(action.page, action.issue);
        else if (action.kind === "open_move") onOpenMove?.(action.moveType);
        else if (action.kind === "open_trip_replay") onOpenPage("driving");
      });
    }
  }, [messages, onOpenPage, onOpenMove]);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, open]);

  const submit = (value = text) => {
    const trimmed = value.trim();
    if (!trimmed || streaming) return;
    setText("");
    setOpen(true);
    void send(personaId, trimmed);
  };

  const suggestions = [
    ...(isLease ? ["What happens at the end of my lease?"] : ["How many payments are left?"]),
    "Can I lower my payment?",
    "My brakes are grinding",
  ];
  const last = messages.at(-1);
  const running = last?.role === "agent" && last.tools.some((t) => t.status === "start");
  const runningTool = running ? last.tools.find((t) => t.status === "start")?.name : undefined;

  return (
    <div className="chat">
      {open && (
        <section className="chat-panel" aria-label="Conversation about your car">
          <div className="chat-panel-bar">
            <span>Toyyo</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Minimize conversation"><ChevronDown size={18} aria-hidden="true" /></button>
          </div>
          <div className="chat-scroll" ref={scroller} aria-live="polite" aria-relevant="additions text">
            {messages.length === 0 && (
              <>
                <p className="chat-hint">Ask about your car, lease or loan. Figures are illustrative demo estimates.</p>
                <ul className="chat-chips">{suggestions.map((s) => <li key={s}><button type="button" onClick={() => submit(s)}>{s}</button></li>)}</ul>
              </>
            )}
            {messages.map((m) => <Message key={m.id} m={m} onOpenPage={onOpenPage} />)}
            {runningTool && <p className="chat-tool" role="status">{toolLabel[runningTool] ?? "Working on it"}…</p>}
          </div>
        </section>
      )}
      {!open && messages.length === 0 && (
        <ul className="chat-chips chat-chips-bar" aria-label="Suggested questions">
          {suggestions.map((s) => <li key={s}><button type="button" onClick={() => submit(s)}>{s}</button></li>)}
        </ul>
      )}
      <form className="chat-bar" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label htmlFor="car-chat-input" className="chat-sr">Ask about your car, lease or loan</label>
        <input id="car-chat-input" ref={input} type="text" autoComplete="off" maxLength={500} value={text} placeholder="Ask about your car, lease or loan…"
          onChange={(e) => setText(e.target.value)} onFocus={() => { if (messages.length) setOpen(true); }} />
        {streaming ? (
          <button type="button" className="chat-send is-stop" onClick={stop} aria-label="Stop"><Square size={16} aria-hidden="true" /></button>
        ) : (
          <button type="submit" className="chat-send" disabled={!text.trim()} aria-label="Send"><ArrowUp size={18} aria-hidden="true" /></button>
        )}
      </form>
    </div>
  );
}

const PAGE_CHIP: Record<DashboardPage, { label: string; Icon: typeof Wrench }> = {
  repairs: { label: "Open Repairs", Icon: Wrench },
  driving: { label: "Open Driving", Icon: Activity },
  finances: { label: "Open Finances", Icon: Percent },
  overview: { label: "Open dashboard", Icon: LayoutDashboard },
};

function ActionChip({ action, onOpenPage }: { action: UiAction; onOpenPage: CarChatProps["onOpenPage"] }) {
  if (action.kind !== "open_page") return null;
  const { label, Icon } = PAGE_CHIP[action.page];
  return (
    <button type="button" className="chat-action" onClick={() => onOpenPage(action.page, action.issue)}>
      <Icon size={15} aria-hidden="true" /> {label}
    </button>
  );
}

function Message({ m, onOpenPage }: { m: ChatMessage; onOpenPage: CarChatProps["onOpenPage"] }) {
  if (m.role === "user") return <p className="chat-user">{m.text}</p>;
  return (
    <div className="chat-agent">
      {m.text ? <Markdown text={m.text} className="chat-md" /> : m.streaming && !m.error ? <p className="chat-tool">Thinking…</p> : null}
      {m.error && <p className="chat-error" role="alert">{m.error}</p>}
      {m.actions.filter((a) => a.kind === "open_page").map((a, i) => <ActionChip key={i} action={a} onOpenPage={onOpenPage} />)}
    </div>
  );
}
