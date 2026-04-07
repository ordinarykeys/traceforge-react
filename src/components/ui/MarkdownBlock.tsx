import { marked } from "marked";
import DOMPurify from "dompurify";
import { memo, useMemo, useRef, useEffect, useCallback, type MutableRefObject } from "react";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { markedHighlight } from "marked-highlight";
import { useLocaleStore } from "@/hooks/useLocaleStore";
import { translate } from "@/lib/i18n";

import "highlight.js/styles/atom-one-dark.css"; 

let mermaidInstance: typeof import("mermaid").default | null = null;
let lastMermaidTheme: "dark" | "default" | null = null;
let highlightLanguagesRegistered = false;

function ensureHighlightLanguagesRegistered() {
  if (highlightLanguagesRegistered) {
    return;
  }
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("shell", bash);
  hljs.registerLanguage("cpp", cpp);
  hljs.registerLanguage("c", cpp);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("go", go);
  hljs.registerLanguage("java", java);
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("js", javascript);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("markdown", markdown);
  hljs.registerLanguage("md", markdown);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("py", python);
  hljs.registerLanguage("rust", rust);
  hljs.registerLanguage("rs", rust);
  hljs.registerLanguage("sql", sql);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("ts", typescript);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("html", xml);
  hljs.registerLanguage("yaml", yaml);
  hljs.registerLanguage("yml", yaml);
  highlightLanguagesRegistered = true;
}

ensureHighlightLanguagesRegistered();

async function getMermaid() {
  if (!mermaidInstance) {
    const mod = await import("mermaid");
    mermaidInstance = mod.default;
    
    // We can infer theme based on root html classes
    const isDark = document.documentElement.classList.contains("dark") || 
                   document.body.classList.contains("dark");
    const theme: "dark" | "default" = isDark ? "dark" : "default";
    lastMermaidTheme = theme;

    mermaidInstance.initialize({
      startOnLoad: false,
      theme,
      securityLevel: "strict",
      fontFamily: "inherit",
    });
  }
  return mermaidInstance;
}

// Configure marked to use syntax highlighting
marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string) {
      if (lang === "mermaid") return code; // Skip mermaid
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch {}
      }
      return hljs.highlightAuto(code).value;
    },
  })
);

marked.setOptions({
  breaks: false,
  gfm: true,
});

interface MarkdownBlockProps {
  content?: string;
  isStreaming?: boolean;
}

interface StreamingRenderCache {
  stableSource: string;
  stableHtml: string;
}

const FULL_MARKDOWN_CACHE_LIMIT = 120;
const STREAMING_SEGMENT_CACHE_LIMIT = 240;
const MERMAID_SVG_CACHE_LIMIT = 80;
const fullMarkdownHtmlCache = new Map<string, string>();
const streamingSegmentHtmlCache = new Map<string, string>();
const mermaidSvgCache = new Map<string, string>();
const MD_SYNTAX_RE = /[#*`|[>\-_~]|\n\n|^\d+\. |\n\d+\. /;

function hasMarkdownSyntax(content: string): boolean {
  return MD_SYNTAX_RE.test(content.length > 500 ? content.slice(0, 500) : content);
}

function escapeHtml(content: string): string {
  return content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderPlainTextHtml(content: string): string {
  if (!content) return "";
  return content
    .split("\n\n")
    .map((block) => `<p class="mb-2 last:mb-0 leading-relaxed">${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

async function copyTextWithFallback(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------
// Stream-Safe Parsing & Lightweight Renderer
// ---------------------------------------------------------

function makeCacheSignature(content: string): string {
  let hash = 2166136261;
  for (let i = 0; i < content.length; i += 1) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const head = content.slice(0, 16);
  const tail = content.slice(-16);
  return `${content.length}:${hash >>> 0}:${head}:${tail}`;
}

function readLruCache(cache: Map<string, string>, key: string): string | null {
  const hit = cache.get(key);
  if (hit === undefined) return null;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function writeLruCache(cache: Map<string, string>, limit: number, key: string, value: string) {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  if (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
}

function makeStreamSafe(content: string): string {
  if (!content) return content;
  let result = content;
  let inCodeBlock = false;
  
  for (const line of result.split("\n")) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
    }
  }

  if (inCodeBlock) {
    result += "\n```";
  }

  const lastNewlineIndex = result.lastIndexOf("\n");
  const lastLine = lastNewlineIndex >= 0 ? result.slice(lastNewlineIndex + 1) : result;
  
  const singleBacktickMatches = lastLine.match(/(?<!`)`(?!`)/g);
  if (singleBacktickMatches && singleBacktickMatches.length % 2 !== 0) {
    result += "`";
  }

  return result;
}

function safeLang(lang: string): string {
  return lang.replace(/[^a-zA-Z0-9_.-]/g, "");
}

function renderStreamingContent(content: string, options?: { alreadySafe?: boolean }): string {
  if (!content) return "";
  const safeContent = options?.alreadySafe ? content : makeStreamSafe(content);
  const signature = makeCacheSignature(safeContent);
  const cacheKey = `stream:${signature}`;
  const cached = readLruCache(streamingSegmentHtmlCache, cacheKey);
  if (cached !== null) {
    return cached;
  }

  if (!safeContent.includes("```") && !hasMarkdownSyntax(safeContent)) {
    const plain = renderPlainTextHtml(safeContent);
    writeLruCache(streamingSegmentHtmlCache, STREAMING_SEGMENT_CACHE_LIMIT, cacheKey, plain);
    return plain;
  }
  
  const segments: string[] = [];
  let current = "";
  let inCode = false;
  let codeLang = "";

  for (const line of safeContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      if (!inCode) {
        if (current) segments.push(current);
        current = "";
        inCode = true;
        codeLang = safeLang(trimmed.slice(3).trim());
      } else {
        const escaped = current.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        segments.push(
          `<pre class="group relative p-4 font-mono text-[12.5px] leading-relaxed rounded-lg border border-border/50 bg-muted/35 shadow-sm my-4 overflow-x-auto overflow-y-hidden max-h-[500px] scrollbar-thin select-text"><code class="hljs ${codeLang ? `language-${codeLang}` : ""}">\n${escaped}\n</code></pre>`,
        );
        current = "";
        inCode = false;
        codeLang = "";
      }
      continue;
    }
    current += (current ? "\n" : "") + line;
  }

  if (current) {
    if (inCode) {
      const escaped = current.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      segments.push(
        `<pre class="group relative p-4 font-mono text-[12.5px] leading-relaxed rounded-lg border border-border/50 bg-muted/35 shadow-sm my-4 overflow-x-auto overflow-y-hidden max-h-[500px] scrollbar-thin select-text"><code class="hljs ${codeLang ? `language-${codeLang}` : ""}">\n${escaped}\n</code></pre>`,
      );
    } else {
      segments.push(current);
    }
  }

  const raw = segments.map((seg) => {
    if (seg.startsWith("<pre")) return seg;

    let html = seg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.replace(/`([^`\n]+)`/g, "<code class='bg-muted/50 px-1 py-0.5 rounded text-primary/90 font-mono'>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong class='text-foreground font-bold'>$1</strong>");
    html = html.replace(/^(#{1,6})\s+(.+)$/gm, (_m, hashes, text) => {
      return `<h${hashes.length} class="font-bold text-primary mt-4 mb-2">${text}</h${hashes.length}>`;
    });
    
    // Convert newlines directly to breaks inside standard text block
    html = html.replace(/\n\n/g, "</p><p>");
    html = html.replace(/\n/g, "<br/>");
    
    return `<p class="mb-2 last:mb-0">${html}</p>`;
  }).join("");

  const rendered = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ["p", "br", "pre", "code", "strong", "h1", "h2", "h3", "h4", "h5", "h6"],
    ALLOWED_ATTR: ["class"],
  });
  writeLruCache(streamingSegmentHtmlCache, STREAMING_SEGMENT_CACHE_LIMIT, cacheKey, rendered);
  return rendered;
}

function renderStreamingIncremental(
  content: string,
  cacheRef: MutableRefObject<StreamingRenderCache>,
): string {
  if (!content) {
    cacheRef.current = { stableSource: "", stableHtml: "" };
    return "";
  }

  const safeContent = makeStreamSafe(content);
  const cache = cacheRef.current;
  let stableSource = cache.stableSource;

  if (!safeContent.startsWith(stableSource)) {
    stableSource = "";
  }

  const boundary = stableSource.length;
  const tokens = marked.lexer(safeContent.slice(boundary));
  let lastContentIndex = tokens.length - 1;
  while (lastContentIndex >= 0 && tokens[lastContentIndex]?.type === "space") {
    lastContentIndex -= 1;
  }

  let advance = 0;
  for (let index = 0; index < lastContentIndex; index += 1) {
    const raw = tokens[index]?.raw;
    if (typeof raw === "string") {
      advance += raw.length;
    }
  }

  if (advance > 0) {
    stableSource = safeContent.slice(0, boundary + advance);
  }

  const tailSource = safeContent.slice(stableSource.length);

  let stableHtml = "";
  if (stableSource.length > 0) {
    if (stableSource === cache.stableSource) {
      stableHtml = cache.stableHtml;
    } else if (cache.stableSource.length > 0 && stableSource.startsWith(cache.stableSource)) {
      const deltaSource = stableSource.slice(cache.stableSource.length);
      const deltaHtml = renderStreamingContent(deltaSource, { alreadySafe: true });
      stableHtml = `${cache.stableHtml}${deltaHtml}`;
    } else {
      stableHtml = renderStreamingContent(stableSource, { alreadySafe: true });
    }
  }

  cacheRef.current = { stableSource, stableHtml };
  const tailHtml = tailSource ? renderStreamingContent(tailSource, { alreadySafe: true }) : "";
  return `${stableHtml}${tailHtml}`;
}

function scheduleIdle(callback: () => void): () => void {
  if (typeof window === "undefined") {
    callback();
    return () => undefined;
  }
  const hostWindow = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof hostWindow.requestIdleCallback === "function") {
    const id = hostWindow.requestIdleCallback(
      () => {
        callback();
      },
      { timeout: 180 },
    );
    return () => {
      if (typeof hostWindow.cancelIdleCallback === "function") {
        hostWindow.cancelIdleCallback(id);
      }
    };
  }
  const timer = window.setTimeout(() => {
    callback();
  }, 48);
  return () => {
    window.clearTimeout(timer);
  };
}

let mermaidIdCounter = 0;

const MarkdownBlock = ({ content = "", isStreaming = false }: MarkdownBlockProps) => {
  const { locale } = useLocaleStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const prevIsStreamingRef = useRef(isStreaming);
  const streamingCacheRef = useRef<StreamingRenderCache>({
    stableSource: "",
    stableHtml: "",
  });

  const renderMermaidDiagrams = useCallback(async () => {
    if (!containerRef.current) return;
    const codeBlocks = containerRef.current.querySelectorAll("pre code");

    for (const codeBlock of codeBlocks) {
      const pre = codeBlock.parentElement;
      if (!pre) continue;
      if (pre.dataset.tfMermaidRendered === "1") continue;
      
      const isMermaid = codeBlock.classList.contains("language-mermaid") || 
                        codeBlock.textContent?.trim().startsWith("flowchart") ||
                        codeBlock.textContent?.trim().startsWith("graph") ||
                        codeBlock.textContent?.trim().startsWith("sequenceDiagram");

      if (!isMermaid) continue;

      let code = codeBlock.textContent || "";
      code = code.replace(/^```mermaid\s*/i, "").replace(/```\s*$/, "").trim();
      if (!code) continue;

      try {
        const mmd = await getMermaid();
        const isDark = document.documentElement.classList.contains("dark") || 
                       document.body.classList.contains("dark");
        const theme: "dark" | "default" = isDark ? "dark" : "default";
        if (lastMermaidTheme !== theme) {
          mmd.initialize({
            startOnLoad: false,
            theme,
            securityLevel: "strict",
            fontFamily: "inherit",
          });
          lastMermaidTheme = theme;
        }

        const svgCacheKey = `${theme}:${makeCacheSignature(code)}`;
        const cachedSvg = readLruCache(mermaidSvgCache, svgCacheKey);
        let svg = cachedSvg;
        if (!svg) {
          const id = `mermaid-${++mermaidIdCounter}`;
          const rendered = await mmd.render(id, code);
          svg = rendered.svg;
          writeLruCache(mermaidSvgCache, MERMAID_SVG_CACHE_LIMIT, svgCacheKey, svg);
        }

        const wrapper = document.createElement("div");
        wrapper.className = "mermaid-rendered flex justify-center py-4 my-4 bg-muted/10 rounded-lg border border-border/20";
        wrapper.innerHTML = svg;
        pre.style.display = "none";
        pre.dataset.tfMermaidRendered = "1";
        pre.parentNode?.insertBefore(wrapper, pre);
      } catch (e) {
        console.warn("Mermaid rendering failed", e);
      }
    }
  }, []);

  const decorateCodeBlocks = useCallback(() => {
    if (!containerRef.current) return;

    const preBlocks = containerRef.current.querySelectorAll("pre");
    for (const pre of preBlocks) {
      pre.classList.add("group", "relative", "select-text");
      const code = pre.querySelector("code");
      if (!code) continue;

      code.classList.add("select-text");
      (code as HTMLElement).style.backgroundColor = "transparent";

      const isMermaid =
        code.classList.contains("language-mermaid") ||
        code.textContent?.trim().startsWith("flowchart") ||
        code.textContent?.trim().startsWith("graph") ||
        code.textContent?.trim().startsWith("sequenceDiagram");
      if (isMermaid) continue;

      const existingButton = pre.querySelector<HTMLButtonElement>("button[data-tf-copy-code='1']");
      if (existingButton) continue;

      const button = document.createElement("button");
      button.type = "button";
      button.dataset.tfCopyCode = "1";
      button.className =
        "absolute right-2 top-2 z-10 rounded border border-border/50 bg-background/85 px-2 py-1 text-[10px] font-mono text-muted-foreground shadow-sm backdrop-blur transition hover:bg-background";
      button.textContent = translate(locale, "markdown.copyCode");

      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const text = code.textContent ?? "";
        if (!text) return;
        const ok = await copyTextWithFallback(text);
        button.textContent = ok
          ? translate(locale, "markdown.copied")
          : translate(locale, "markdown.copyFailed");
        window.setTimeout(() => {
          button.textContent = translate(locale, "markdown.copyCode");
        }, 1200);
      });

      pre.appendChild(button);
    }
  }, [locale]);

  // Normal complete parsing
  const html = useMemo(() => {
    try {
      if (isStreaming) {
        return renderStreamingIncremental(content, streamingCacheRef);
      }
      streamingCacheRef.current = { stableSource: "", stableHtml: "" };
      const contentSignature = makeCacheSignature(content);
      const fullCacheKey = `full:${contentSignature}`;
      const cached = readLruCache(fullMarkdownHtmlCache, fullCacheKey);
      if (cached !== null) {
        return cached;
      }
      
      if (!content.includes("```") && !hasMarkdownSyntax(content)) {
        const plain = renderPlainTextHtml(content);
        writeLruCache(fullMarkdownHtmlCache, FULL_MARKDOWN_CACHE_LIMIT, fullCacheKey, plain);
        return plain;
      }

      const parsed = marked.parse(content);
      const sanitized = DOMPurify.sanitize(
        typeof parsed === "string" ? parsed : String(parsed),
        { ADD_ATTR: ["class"] }
      );
      
      // Inject standard Tailwind typography elements structurally into the raw HTML
      const doc = new DOMParser().parseFromString(sanitized, "text/html");
      doc.querySelectorAll("pre").forEach(pre => {
        pre.className = "group relative p-4 font-mono text-[12.5px] leading-relaxed rounded-lg border border-border/50 bg-muted/35 shadow-sm my-4 overflow-x-auto overflow-y-hidden max-h-[500px] scrollbar-thin select-text";
      });
      doc.querySelectorAll("pre code").forEach(code => {
        (code as HTMLElement).style.backgroundColor = "transparent";
        code.classList.add("select-text");
      });
      doc.querySelectorAll("h1, h2, h3").forEach(h => h.classList.add("font-bold", "text-primary", "mt-4", "mb-2"));
      doc.querySelectorAll("p").forEach(p => p.classList.add("mb-2", "last:mb-0", "leading-relaxed"));
      doc.querySelectorAll("code:not(pre code)").forEach(code => {
        code.className = "bg-muted/50 px-1.5 py-0.5 rounded text-[11.5px] text-primary/80 font-mono font-medium";
      });
      doc.querySelectorAll("ul").forEach(ul => {
        ul.className = "list-disc pl-5 mb-2 space-y-1";
      });
      doc.querySelectorAll("ol").forEach(ol => {
        ol.className = "list-decimal pl-5 mb-2 space-y-1";
      });
      doc.querySelectorAll("table").forEach(table => {
        table.className = "w-full border-collapse border border-border/50 my-4 text-[13px]";
        table.querySelectorAll("th").forEach(th => th.className = "border border-border/50 px-3 py-2 bg-muted/30 font-bold text-left");
        table.querySelectorAll("td").forEach(td => td.className = "border border-border/50 px-3 py-2");
      });
      doc.querySelectorAll("a").forEach(a => {
        a.className = "text-blue-500 hover:text-blue-400 hover:underline transition-colors";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      });
      
      const finalHtml = doc.body.innerHTML;
      writeLruCache(fullMarkdownHtmlCache, FULL_MARKDOWN_CACHE_LIMIT, fullCacheKey, finalHtml);
      return finalHtml;
    } catch {
      return escapeHtml(content);
    }
  }, [content, isStreaming]);

  // Handle post-render actions (diagrams)
  useEffect(() => {
    const hasPreTag = html.includes("<pre");
    const mayContainMermaid =
      /```[ \t]*mermaid\b/i.test(content) ||
      html.includes("language-mermaid");

    if (containerRef.current && hasPreTag) {
      decorateCodeBlocks();
    }

    if (!isStreaming && containerRef.current && hasPreTag && mayContainMermaid) {
      const dispose = scheduleIdle(() => {
        if (prevIsStreamingRef.current) {
          requestAnimationFrame(() => {
            renderMermaidDiagrams().finally(() => {
              decorateCodeBlocks();
            });
          });
          return;
        }
        void renderMermaidDiagrams().finally(() => {
          decorateCodeBlocks();
        });
      });
      prevIsStreamingRef.current = isStreaming;
      return () => {
        dispose();
      };
    }
    prevIsStreamingRef.current = isStreaming;
  }, [html, content, isStreaming, renderMermaidDiagrams, decorateCodeBlocks]);

  return (
    <div
      ref={containerRef}
      className="markdown-content w-full whitespace-normal break-words"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default memo(MarkdownBlock);
