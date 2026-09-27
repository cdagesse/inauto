"use client";

import { useRef, useState, useTransition } from "react";
import type { AssistantCar } from "@/lib/assistant/context";
import { type AssistantReply, describeCarTurn } from "@/server/assistant";

type Msg = { role: "user" | "assistant"; content: string };

/**
 * Chat with the writing assistant about the car. It asks a few questions,
 * then offers a description. Nothing lands in the listing until the seller
 * clicks "Use this description".
 */
export function DescriptionAssistant({
  car,
  current,
  onAccept,
}: {
  car: AssistantCar;
  current: string;
  onAccept: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState<Msg[]>([]);
  const [last, setLast] = useState<AssistantReply | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const ready = !!car.make && !!car.model;

  function send(text?: string) {
    const content = (text ?? input).trim();
    const next: Msg[] = content ? [...transcript, { role: "user", content }] : transcript;
    setError(null);
    setInput("");
    start(async () => {
      const r = await describeCarTurn({ car, transcript: next, current: current || null });
      if (!r.ok) return setError(r.error);
      setTranscript([...next, { role: "assistant", content: r.data.reply }]);
      setLast(r.data);
      requestAnimationFrame(() =>
        bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      );
    });
  }

  if (!open)
    return (
      <div className="assistant-cta">
        <button
          type="button"
          className="btn sm"
          disabled={!ready}
          onClick={() => {
            setOpen(true);
            if (transcript.length === 0) send();
          }}
        >
          Help me write this
        </button>
        <span className="hint">
          {ready
            ? "The assistant looks up the car, asks a few questions, and drafts a description you can accept or change."
            : "Enter the make and model first."}
        </span>
      </div>
    );

  return (
    <div className="assistant panel">
      <div className="ms-head" style={{ marginBottom: 6 }}>
        <div>
          <div className="lab">Writing assistant</div>
          <span className="hint">
            {car.year ? `${car.year} ` : ""}
            {car.make} {car.model}
            {car.trim ? ` ${car.trim}` : ""}
          </span>
        </div>
        <button type="button" className="btn sm" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <div className="assistant-log">
        {transcript.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        {pending ? <div className="bubble assistant hint">Thinking…</div> : null}
        <div ref={bottom} />
      </div>
      {last?.questions.length && !pending ? (
        <div className="assistant-questions">
          {last.questions.map((q) => (
            <span key={q} className="pill">
              {q}
            </span>
          ))}
        </div>
      ) : null}
      {last?.draft && !pending ? (
        <div className="assistant-draft">
          <div className="lab">Suggested description</div>
          <p>{last.draft}</p>
          <div className="card-actions">
            <button type="button" className="btn sm primary" onClick={() => onAccept(last.draft!)}>
              Use this description
            </button>
            <button type="button" className="btn sm" onClick={() => send("Please revise it: ")}>
              Ask for changes
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="err">{error}</p> : null}
      <form
        className="assistant-input"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={last?.draft ? "Tell it what to change, or add details" : "Answer here"}
          maxLength={2000}
          disabled={pending}
          aria-label="Message to the assistant"
        />
        <button type="submit" className="btn sm primary" disabled={pending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
