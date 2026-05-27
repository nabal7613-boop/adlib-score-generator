"use client";

import {
  FileAudio,
  Loader2,
  Music2,
  Play,
  Sparkles,
  UploadCloud,
  Wand2,
  X
} from "lucide-react";
import { DragEvent, FormEvent, useMemo, useState } from "react";

type UploadedScore = {
  file: File;
  url: string;
  kind: "image" | "pdf";
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
  const [style, setStyle] = useState("재즈 발라드, 따뜻한 코드 보이싱, 색소폰 애드립");
  const [hasGenerated, setHasGenerated] = useState(false);

  const fileMeta = useMemo(() => {
    if (!score) return null;

    const sizeInMb = score.file.size / 1024 / 1024;
    return `${score.file.name} · ${sizeInMb.toFixed(sizeInMb > 1 ? 1 : 2)}MB`;
  }, [score]);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");

    if (!isPdf && !isImage) return;

    setScore((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return {
        file,
        url: URL.createObjectURL(file),
        kind: isPdf ? "pdf" : "image"
      };
    });
    setHasGenerated(false);
    setIsAnalyzing(true);
    window.setTimeout(() => setIsAnalyzing(false), 1600);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  const generateAdlib = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!score || isAnalyzing) return;

    setHasGenerated(false);
    setIsAnalyzing(true);
    window.setTimeout(() => {
      setIsAnalyzing(false);
      setHasGenerated(true);
    }, 1400);
  };

  const removeScore = () => {
    if (score) URL.revokeObjectURL(score.url);
    setScore(null);
    setIsAnalyzing(false);
    setHasGenerated(false);
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
                악보를 올리고 원하는 무드의 애드립 라인을 생성하세요.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-line bg-black/30 px-3 py-2 text-sm text-zinc-300">
            <span className="h-2 w-2 rounded-full bg-moss shadow-[0_0_16px_rgba(30,215,96,0.8)]" />
            Live session
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
                악보 이미지 또는 PDF 업로드
              </span>
              <span className="mt-3 max-w-lg text-sm leading-6 text-zinc-400 sm:text-base">
                파일을 드래그앤드롭하거나 클릭해서 선택하세요. 업로드 후 원본 악보와
                애드립 결과를 나란히 확인할 수 있습니다.
              </span>
              <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-moss px-5 py-3 text-sm font-bold text-ink">
                <FileAudio className="h-4 w-4" aria-hidden />
                Score 선택
              </span>
            </label>
          </section>
        ) : (
          <>
            <section className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-2">
              <ScorePanel
                title="원본 악보"
                meta={fileMeta}
                action={removeScore}
                actionLabel="업로드 제거"
              >
                {score.kind === "pdf" ? (
                  <iframe
                    title="원본 PDF 악보"
                    src={score.url}
                    className="h-full min-h-[420px] w-full rounded-md border-0 bg-zinc-950"
                  />
                ) : (
                  <img
                    src={score.url}
                    alt="업로드한 원본 악보"
                    className="h-full min-h-[420px] w-full rounded-md object-contain"
                  />
                )}
              </ScorePanel>

              <ScorePanel title="애드립 결과 악보" meta={style}>
                {isAnalyzing ? (
                  <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-md bg-graphite">
                    <Loader2 className="h-12 w-12 animate-spin text-moss" aria-hidden />
                    <p className="mt-4 text-lg font-semibold text-white">분석중...</p>
                    <p className="mt-2 text-sm text-zinc-400">
                      코드 진행과 멜로디 흐름을 읽고 있습니다.
                    </p>
                  </div>
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
                    placeholder="예: 펑키한 재즈, 빠른 비밥, R&B 보컬 애드립"
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
                  생성
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

function AdlibPreview({ hasGenerated }: { hasGenerated: boolean }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col bg-[#fbfbf3] p-4 text-zinc-950">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-zinc-300 pb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-fern">
            Generated Adlib
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
            <div className="absolute left-1 top-0 text-5xl leading-none">{staff === 0 ? "𝄞" : "𝄢"}</div>
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
        <span>{hasGenerated ? "새 애드립 생성 완료" : "스타일을 입력하고 생성 버튼을 누르세요"}</span>
        <span>BPM 92 · Swing</span>
      </div>
    </div>
  );
}
