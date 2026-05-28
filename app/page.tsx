"use client";

import {
  AlertCircle,
  FileAudio,
  Loader2,
  Music2,
  Play,
  Sparkles,
  UploadCloud,
  Wand2,
  X
} from "lucide-react";
import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type UploadedScore = {
  file: File;
  url: string;
  kind: "image" | "pdf";
};

type AnalysisResult = {
  title?: string;
  composer?: string;
  key?: string;
  tempo?: string;
  timeSignature?: string;
  totalBars?: number;
  barsPerLine?: number;
  chordProgression?: string[];
  barChords?: BarChord[];
  sections?: ScoreSection[];
  confidence?: {
    key?: number;
    tempo?: number;
    chordProgression?: number;
    layout?: number;
  };
};

type BarChord = {
  bar: number;
  chord: string;
};

type ScoreSection = {
  label: string;
  startBar: number;
  endBar?: number;
};

type MelodyNote = {
  keys: string[];
  duration: "8" | "q" | "h" | string;
  chord?: string;
};

type MelodyResult = {
  title?: string;
  composer?: string;
  key?: string;
  tempo?: string;
  timeSignature?: string;
  totalBars?: number;
  barsPerLine?: number;
  chordProgression?: string[];
  barChords?: BarChord[];
  sections?: ScoreSection[];
  notes?: MelodyNote[];
};

const sampleBars = [
  "M7 9 13",
  "Dm7 G7alt",
  "Cmaj7 #11",
  "Chromatic run",
  "Blue note fall",
  "Triplet pickup",
  "Upper structure",
  "Resolve"
];

export default function Home() {
  const [score, setScore] = useState<UploadedScore | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [style, setStyle] = useState("Jazz ballad, warm voicings, saxophone adlib");
  const [hasGenerated, setHasGenerated] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [melody, setMelody] = useState<MelodyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState("Analyzing...");

  const fileMeta = useMemo(() => {
    if (!score) return null;

    const sizeInMb = score.file.size / 1024 / 1024;
    return `${score.file.name} - ${sizeInMb.toFixed(sizeInMb > 1 ? 1 : 2)}MB`;
  }, [score]);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");

    if (!isPdf && !isImage) {
      setError("Please upload an image or PDF score.");
      return;
    }

    setScore((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return {
        file,
        url: URL.createObjectURL(file),
        kind: isPdf ? "pdf" : "image"
      };
    });
    setHasGenerated(false);
    setAnalysis(null);
    setMelody(null);
    setError(null);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  const generateAdlib = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!score || isAnalyzing) return;

    if (score.kind !== "image") {
      setError("Claude analysis currently supports image files. Please upload a score image.");
      setAnalysis(null);
      setMelody(null);
      setHasGenerated(false);
      return;
    }

    const formData = new FormData();
    formData.append("score", score.file);
    formData.append("style", style);

    setError(null);
    setAnalysis(null);
    setMelody(null);
    setHasGenerated(false);
    setLoadingText("Analyzing score...");
    setIsAnalyzing(true);

    try {
      const analysisResponse = await fetch("/api/analyze", {
        method: "POST",
        body: formData
      });

      const analysisData = (await analysisResponse.json()) as AnalysisResult & {
        error?: string;
      };

      if (!analysisResponse.ok) {
        throw new Error(analysisData.error ?? "Score analysis failed.");
      }

      setAnalysis(analysisData);
      setLoadingText("Generating adlib melody...");

      const melodyResponse = await fetch("/api/generate-melody", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          title: analysisData.title,
          composer: analysisData.composer,
          key: analysisData.key,
          tempo: analysisData.tempo,
          timeSignature: analysisData.timeSignature,
          totalBars: analysisData.totalBars,
          barsPerLine: analysisData.barsPerLine,
          chordProgression: analysisData.chordProgression,
          barChords: analysisData.barChords,
          sections: analysisData.sections,
          style
        })
      });

      const melodyData = (await melodyResponse.json()) as MelodyResult & {
        error?: string;
      };

      if (!melodyResponse.ok) {
        throw new Error(melodyData.error ?? "Melody generation failed.");
      }

      setMelody(melodyData);
      setHasGenerated(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Score analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const removeScore = () => {
    if (score) URL.revokeObjectURL(score.url);
    setScore(null);
    setIsAnalyzing(false);
    setHasGenerated(false);
    setAnalysis(null);
    setMelody(null);
    setError(null);
  };

  return (
    <main className="min-h-screen px-4 py-5 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-lg border border-line bg-white/[0.04] px-4 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-moss text-ink shadow-glow">
              <Music2 className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-normal text-white sm:text-2xl">
                Adlib Score Generator
              </h1>
              <p className="text-sm text-zinc-400">
                Upload a score image, analyze it with Claude, and shape a new adlib idea.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-line bg-black/30 px-3 py-2 text-sm text-zinc-300">
            <span className="h-2 w-2 rounded-full bg-moss shadow-[0_0_16px_rgba(30,215,96,0.8)]" />
            Claude ready
          </div>
        </header>

        {!score ? (
          <section className="grid flex-1 place-items-center rounded-lg border border-line bg-black/35 p-4 shadow-glow">
            <label
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex min-h-[420px] w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center transition sm:min-h-[520px] ${
                isDragging
                  ? "border-moss bg-moss/10"
                  : "border-white/20 bg-white/[0.03] hover:border-moss/70 hover:bg-white/[0.05]"
              }`}
            >
              <input
                className="sr-only"
                type="file"
                accept="image/*,application/pdf"
                onChange={(event) => handleFiles(event.target.files)}
              />
              <UploadCloud className="mb-5 h-14 w-14 text-moss" aria-hidden />
              <span className="text-2xl font-bold text-white sm:text-4xl">
                Upload score image or PDF
              </span>
              <span className="mt-3 max-w-lg text-sm leading-6 text-zinc-400 sm:text-base">
                Drag and drop a file here, or click to choose one. Image files can be sent
                to Claude for key, tempo, and chord progression analysis.
              </span>
              <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-moss px-5 py-3 text-sm font-bold text-ink">
                <FileAudio className="h-4 w-4" aria-hidden />
                Choose score
              </span>
            </label>
          </section>
        ) : (
          <>
            <section className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-2">
              <ScorePanel
                title="Original score"
                meta={fileMeta}
                action={removeScore}
                actionLabel="Remove upload"
              >
                {score.kind === "pdf" ? (
                  <iframe
                    title="Original PDF score"
                    src={score.url}
                    className="h-full min-h-[420px] w-full rounded-md border-0 bg-zinc-950"
                  />
                ) : (
                  <img
                    src={score.url}
                    alt="Uploaded original score"
                    className="h-full min-h-[420px] w-full rounded-md object-contain"
                  />
                )}
              </ScorePanel>

              <ScorePanel title="Claude analysis" meta={style}>
                {isAnalyzing ? (
                  <LoadingAnalysis text={loadingText} />
                ) : error ? (
                  <ErrorResult message={error} />
                ) : melody ? (
                  <MelodyScoreView melody={melody} analysis={analysis} />
                ) : analysis ? (
                  <AnalysisResultView analysis={analysis} raw={analysis} />
                ) : (
                  <AdlibPreview hasGenerated={hasGenerated} />
                )}
              </ScorePanel>
            </section>

            <form
              onSubmit={generateAdlib}
              className="rounded-lg border border-line bg-white/[0.05] p-3 backdrop-blur"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-line bg-black/35 px-4 py-3">
                  <Wand2 className="h-5 w-5 shrink-0 text-moss" aria-hidden />
                  <input
                    value={style}
                    onChange={(event) => setStyle(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500 sm:text-base"
                    placeholder="e.g. funky jazz, fast bebop, R&B vocal adlib"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isAnalyzing}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-moss px-5 text-sm font-bold text-ink transition hover:bg-[#22ef6c] disabled:cursor-not-allowed disabled:bg-zinc-600 disabled:text-zinc-300"
                >
                  {isAnalyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Play className="h-4 w-4 fill-current" aria-hidden />
                  )}
                  Generate
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

function ScorePanel({
  title,
  meta,
  action,
  actionLabel,
  children
}: {
  title: string;
  meta?: string | null;
  action?: () => void;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex min-h-[520px] flex-col rounded-lg border border-line bg-black/40 p-3 shadow-[0_18px_80px_rgba(0,0,0,0.35)]">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white">{title}</h2>
          {meta ? (
            <p className="truncate text-xs text-zinc-500 sm:text-sm">{meta}</p>
          ) : null}
        </div>
        {action ? (
          <button
            type="button"
            onClick={action}
            aria-label={actionLabel}
            title={actionLabel}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-zinc-300 transition hover:border-moss/70 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="relative flex-1 overflow-hidden rounded-md border border-line bg-zinc-950/80">
        {children}
      </div>
    </article>
  );
}

function LoadingAnalysis({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-md bg-graphite">
      <Loader2 className="h-12 w-12 animate-spin text-moss" aria-hidden />
      <p className="mt-4 text-lg font-semibold text-white">{text}</p>
      <p className="mt-2 text-sm text-zinc-400">
        Claude is reading the score and composing notation-ready adlib notes.
      </p>
    </div>
  );
}

function ErrorResult({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 rounded-md bg-graphite p-6 text-center">
      <AlertCircle className="h-10 w-10 text-red-400" aria-hidden />
      <p className="text-lg font-semibold text-white">Analysis failed</p>
      <p className="max-w-md text-sm leading-6 text-zinc-400">{message}</p>
    </div>
  );
}

function MelodyScoreView({
  melody,
  analysis
}: {
  melody: MelodyResult;
  analysis: AnalysisResult | null;
}) {
  return (
    <div className="flex h-full min-h-[420px] flex-col gap-4 overflow-auto bg-[#fbfbf3] p-4 text-zinc-950">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-300 pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-fern">
            Layout matched adlib
          </p>
          <h3 className="text-2xl font-black tracking-normal">
            {melody.title ?? analysis?.title ?? "Claude Melody"}
          </h3>
          <p className="mt-1 text-sm font-semibold text-zinc-600">
            Key {melody.key ?? analysis?.key ?? "unknown"} - Tempo{" "}
            {melody.tempo ?? analysis?.tempo ?? "unknown"}
          </p>
        </div>
        <Sparkles className="h-6 w-6 text-fern" aria-hidden />
      </div>

      <VexFlowScore melody={melody} analysis={analysis} />

      <section className="rounded-md border border-zinc-300 bg-zinc-950 p-4 text-zinc-100">
        <h4 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-moss">
          Melody JSON
        </h4>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-5 text-zinc-300">
          {JSON.stringify(melody, null, 2)}
        </pre>
      </section>
    </div>
  );
}

function VexFlowScore({
  melody,
  analysis
}: {
  melody: MelodyResult;
  analysis: AnalysisResult | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderScore() {
      if (!containerRef.current) return;

      const container = containerRef.current;
      container.innerHTML = "";
      setRenderError(null);

      try {
        const { Annotation, Barline, Formatter, Renderer, Stave, StaveNote, Voice } =
          await import("vexflow");
        const notes = melody.notes?.length ? melody.notes : fallbackNotes();
        const totalBars = clampLayoutNumber(melody.totalBars ?? analysis?.totalBars, 4, 64, 4);
        const barsPerLine = clampLayoutNumber(
          melody.barsPerLine ?? analysis?.barsPerLine,
          1,
          8,
          4
        );
        const chordProgression =
          melody.chordProgression ?? analysis?.chordProgression ?? undefined;
        const barChords = melody.barChords ?? analysis?.barChords;
        const sections = melody.sections ?? analysis?.sections ?? [{ label: "A", startBar: 1 }];
        const measures = splitIntoMeasures(notes, {
          chordProgression,
          barChords,
          totalBars
        });

        if (cancelled) return;

        const renderer = new Renderer(container, Renderer.Backends.SVG);
        const measureWidth = 168;
        const left = 26;
        const scoreTop = 108;
        const lineHeight = 122;
        const lineCount = Math.ceil(measures.length / barsPerLine);
        const width = Math.max(760, left * 2 + barsPerLine * measureWidth);
        const height = Math.max(320, scoreTop + lineCount * lineHeight + 36);
        renderer.resize(width, height);

        const context = renderer.getContext();

        measures.forEach((measure, measureIndex) => {
          const lineIndex = Math.floor(measureIndex / barsPerLine);
          const lineBarIndex = measureIndex % barsPerLine;
          const x = left + lineBarIndex * measureWidth;
          const y = scoreTop + lineIndex * lineHeight;
          const stave = new Stave(x, y, measureWidth);

          if (lineBarIndex === 0) {
            stave.addClef("treble").addTimeSignature(
              melody.timeSignature ?? analysis?.timeSignature ?? "4/4"
            );
          }

          stave.setBegBarType(
            lineBarIndex === 0 ? Barline.type.SINGLE : Barline.type.NONE
          );
          stave.setEndBarType(
            measureIndex === measures.length - 1 ? Barline.type.END : Barline.type.SINGLE
          );
          stave.setContext(context).draw();

          const staveNotes = measure.notes.map((note, noteIndex) => {
            const keys = note.keys?.length ? note.keys : ["c/4"];
            const staveNote = new StaveNote({
              clef: "treble",
              keys: keys.map(normalizeVexKey),
              duration: normalizeDuration(note.duration)
            });

            if (noteIndex === 0) {
              staveNote.addModifier(
                new Annotation(measure.chord)
                  .setFont("Arial", 13, "bold")
                  .setVerticalJustification(Annotation.VerticalJustify.TOP),
                0
              );
            }

            return staveNote;
          });

          const voice = new Voice({ num_beats: 4, beat_value: 4 }).setStrict(false);
          voice.addTickables(staveNotes);

          const formatWidth = lineBarIndex === 0 ? measureWidth - 78 : measureWidth - 28;
          new Formatter().joinVoices([voice]).format([voice], formatWidth);
          voice.draw(context, stave);
        });

        const svg = container.querySelector("svg");
        if (svg) {
          addLeadSheetDecorations(svg, {
            title: melody.title ?? analysis?.title ?? "Untitled",
            composer: melody.composer ?? analysis?.composer ?? "",
            totalBars,
            barsPerLine,
            measureWidth,
            left,
            scoreTop,
            lineHeight,
            sections
          });
        }
      } catch (error) {
        console.error("[VexFlowScore] Failed to render melody", error);
        setRenderError(error instanceof Error ? error.message : "Failed to render melody.");
      }
    }

    renderScore();

    return () => {
      cancelled = true;
    };
  }, [analysis, melody]);

  return (
    <section className="rounded-md border border-zinc-300 bg-white p-3">
      {renderError ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-red-500" aria-hidden />
          <p className="font-bold text-zinc-950">Notation render failed</p>
          <p className="max-w-md text-sm text-zinc-600">{renderError}</p>
        </div>
      ) : null}
      <div ref={containerRef} className="min-h-[240px] w-full overflow-x-auto" />
    </section>
  );
}

function normalizeVexKey(key: string) {
  return key.trim().toLowerCase().replace(/\s+/g, "");
}

function normalizeDuration(duration: string) {
  if (["8", "q", "h"].includes(duration)) return duration;
  return "q";
}

function splitIntoMeasures(
  notes: MelodyNote[],
  {
    chordProgression,
    barChords,
    totalBars
  }: {
    chordProgression?: string[];
    barChords?: BarChord[];
    totalBars: number;
  }
) {
  const measures: Array<{ chord: string; notes: MelodyNote[] }> = [];
  let currentNotes: MelodyNote[] = [];
  let currentBeats = 0;

  notes.forEach((note) => {
    const noteBeats = getDurationBeats(note.duration);

    if (currentBeats + noteBeats > 4 && currentNotes.length > 0) {
      measures.push({
        chord: getMeasureChord(measures.length, currentNotes, chordProgression, barChords),
        notes: currentNotes
      });
      currentNotes = [];
      currentBeats = 0;
    }

    currentNotes.push(note);
    currentBeats += noteBeats;

    if (currentBeats >= 4) {
      measures.push({
        chord: getMeasureChord(measures.length, currentNotes, chordProgression, barChords),
        notes: currentNotes
      });
      currentNotes = [];
      currentBeats = 0;
    }
  });

  if (currentNotes.length > 0) {
    measures.push({
      chord: getMeasureChord(measures.length, currentNotes, chordProgression, barChords),
      notes: currentNotes
    });
  }

  while (measures.length < totalBars) {
    measures.push({
      chord: getMeasureChord(measures.length, [], chordProgression, barChords),
      notes: fallbackNotes().slice(0, 4)
    });
  }

  return measures.slice(0, totalBars);
}

function getMeasureChord(
  measureIndex: number,
  notes: MelodyNote[],
  chordProgression?: string[],
  barChords?: BarChord[]
) {
  return (
    barChords?.find((entry) => entry.bar === measureIndex + 1)?.chord ??
    chordProgression?.[measureIndex] ??
    notes.find((note) => note.chord)?.chord ??
    "Cmaj7"
  );
}

function getDurationBeats(duration: string) {
  if (duration === "h") return 2;
  if (duration === "8") return 0.5;
  return 1;
}

function fallbackNotes(): MelodyNote[] {
  return [
    { keys: ["c/4"], duration: "q", chord: "Cmaj7" },
    { keys: ["e/4"], duration: "q", chord: "Cmaj7" },
    { keys: ["g/4"], duration: "q", chord: "Cmaj7" },
    { keys: ["b/4"], duration: "q", chord: "Cmaj7" },
    { keys: ["a/4"], duration: "q", chord: "E7" },
    { keys: ["g/4"], duration: "q", chord: "E7" },
    { keys: ["e/4"], duration: "q", chord: "E7" },
    { keys: ["d/4"], duration: "q", chord: "E7" },
    { keys: ["f/4"], duration: "q", chord: "A7" },
    { keys: ["a/4"], duration: "q", chord: "A7" },
    { keys: ["c/5"], duration: "q", chord: "A7" },
    { keys: ["a/4"], duration: "q", chord: "A7" },
    { keys: ["d/4"], duration: "q", chord: "Dm7" },
    { keys: ["f/4"], duration: "q", chord: "Dm7" },
    { keys: ["a/4"], duration: "q", chord: "Dm7" },
    { keys: ["c/5"], duration: "q", chord: "Dm7" }
  ];
}

function clampLayoutNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value as number)));
}

function addLeadSheetDecorations(
  svg: SVGSVGElement,
  {
    title,
    composer,
    totalBars,
    barsPerLine,
    measureWidth,
    left,
    scoreTop,
    lineHeight,
    sections
  }: {
    title: string;
    composer: string;
    totalBars: number;
    barsPerLine: number;
    measureWidth: number;
    left: number;
    scoreTop: number;
    lineHeight: number;
    sections: ScoreSection[];
  }
) {
  const ns = "http://www.w3.org/2000/svg";
  const width = Number(svg.getAttribute("width")) || 760;

  const titleText = document.createElementNS(ns, "text");
  titleText.setAttribute("x", String(width / 2));
  titleText.setAttribute("y", "38");
  titleText.setAttribute("text-anchor", "middle");
  titleText.setAttribute("font-family", "Arial, sans-serif");
  titleText.setAttribute("font-size", "24");
  titleText.setAttribute("font-weight", "700");
  titleText.textContent = title;
  svg.appendChild(titleText);

  const bylineText = document.createElementNS(ns, "text");
  bylineText.setAttribute("x", String(width - 28));
  bylineText.setAttribute("y", "66");
  bylineText.setAttribute("text-anchor", "end");
  bylineText.setAttribute("font-family", "Arial, sans-serif");
  bylineText.setAttribute("font-size", "12");
  bylineText.setAttribute("font-weight", "600");
  bylineText.textContent = composer ? `${composer} / Adlib by AI` : "Adlib by AI";
  svg.appendChild(bylineText);

  sections.forEach((section) => {
    const barIndex = Math.min(totalBars - 1, Math.max(0, section.startBar - 1));
    const lineIndex = Math.floor(barIndex / barsPerLine);
    const lineBarIndex = barIndex % barsPerLine;
    const x = left + lineBarIndex * measureWidth + 2;
    const y = scoreTop + lineIndex * lineHeight - 30;

    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", "24");
    rect.setAttribute("height", "20");
    rect.setAttribute("fill", "white");
    rect.setAttribute("stroke", "black");
    rect.setAttribute("stroke-width", "1.5");
    svg.appendChild(rect);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", String(x + 12));
    label.setAttribute("y", String(y + 15));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-family", "Arial, sans-serif");
    label.setAttribute("font-size", "13");
    label.setAttribute("font-weight", "700");
    label.textContent = section.label;
    svg.appendChild(label);
  });
}

function AnalysisResultView({
  analysis,
  raw
}: {
  analysis: AnalysisResult;
  raw: AnalysisResult;
}) {
  const chords = analysis.chordProgression?.length
    ? analysis.chordProgression
    : ["unknown"];

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-4 overflow-auto bg-[#fbfbf3] p-4 text-zinc-950">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-300 pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-fern">
            Claude Result
          </p>
          <h3 className="text-2xl font-black tracking-normal">Score Analysis</h3>
        </div>
        <Sparkles className="h-6 w-6 text-fern" aria-hidden />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ResultMetric
          label="Key"
          value={analysis.key ?? "unknown"}
          confidence={analysis.confidence?.key}
        />
        <ResultMetric
          label="Tempo"
          value={analysis.tempo ?? "unknown"}
          confidence={analysis.confidence?.tempo}
        />
      </div>

      <section className="rounded-md border border-zinc-300 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="text-sm font-black uppercase tracking-[0.16em] text-zinc-600">
            Chord progression
          </h4>
          <span className="text-xs font-bold text-fern">
            {formatConfidence(analysis.confidence?.chordProgression)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {chords.map((chord, index) => (
            <span
              key={`${chord}-${index}`}
              className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-bold text-white"
            >
              {chord}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-zinc-300 bg-zinc-950 p-4 text-zinc-100">
        <h4 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-moss">
          Raw JSON
        </h4>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-5 text-zinc-300">
          {JSON.stringify(raw, null, 2)}
        </pre>
      </section>
    </div>
  );
}

function ResultMetric({
  label,
  value,
  confidence
}: {
  label: string;
  value: string;
  confidence?: number;
}) {
  return (
    <div className="rounded-md border border-zinc-300 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-zinc-950">{value}</p>
      <p className="mt-2 text-xs font-bold text-fern">{formatConfidence(confidence)}</p>
    </div>
  );
}

function formatConfidence(confidence?: number) {
  if (typeof confidence !== "number") return "confidence unknown";
  return `${Math.round(confidence * 100)}% confidence`;
}

function AdlibPreview({ hasGenerated }: { hasGenerated: boolean }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col bg-[#fbfbf3] p-4 text-zinc-950">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-zinc-300 pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-fern">
            Waiting for analysis
          </p>
          <h3 className="text-2xl font-black tracking-normal">Solo Sketch No. 01</h3>
        </div>
        <Sparkles className="h-6 w-6 text-fern" aria-hidden />
      </div>

      <div className="grid flex-1 content-start gap-4">
        {[0, 1, 2, 3].map((staff) => (
          <div key={staff} className="relative h-20">
            <div className="absolute inset-x-0 top-2 grid gap-2">
              {[0, 1, 2, 3, 4].map((line) => (
                <span key={line} className="h-px w-full bg-zinc-900" />
              ))}
            </div>
            <div className="absolute left-16 right-0 top-4 grid grid-cols-4 gap-3">
              {sampleBars.slice(staff * 2, staff * 2 + 4).map((bar, index) => (
                <div
                  key={`${bar}-${index}`}
                  className="relative h-12 border-l border-zinc-800 pl-2"
                >
                  <span className="absolute -top-4 left-2 text-[11px] font-bold text-fern">
                    {bar}
                  </span>
                  <span
                    className={`absolute h-3 w-3 rounded-full bg-zinc-950 ${
                      index % 2 === 0 ? "top-3" : "top-7"
                    }`}
                  />
                  <span
                    className={`absolute left-8 h-3 w-3 rounded-full bg-zinc-950 ${
                      index % 3 === 0 ? "top-1" : "top-5"
                    }`}
                  />
                  <span className="absolute left-12 top-2 h-8 w-px bg-zinc-950" />
                  <span className="absolute left-20 top-6 h-3 w-3 rounded-full bg-zinc-950" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-zinc-300 pt-3 text-xs font-semibold text-zinc-600">
        <span>{hasGenerated ? "Analysis complete" : "Press Generate to analyze the score"}</span>
        <span>BPM 92 - Swing</span>
      </div>
    </div>
  );
}
