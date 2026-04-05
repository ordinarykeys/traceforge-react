import { marked } from "marked";
import DOMPurify from "dompurify";
import { memo, useMemo, useRef, useEffect, useCallback } from "react";
import hljs from "highlight.js";
import { markedHighlight } from "marked-highlight";

// Import core highlight.js theme, we will dynamically toggle a specific theme class or rely on CSS vars
import "highlight.js/styles/atom-one-dark.css"; 
// Note: We use atom-one-dark as our base since it maps well. 
// For pure dynamic themes, one typically uses CSS variables, but atom-one-dark fits the TraceForge 'Expert Grid' dark default nicely.
// We can inject a light theme equivalent if .dark is not present, but standard IDE tools usually stick to Dark or handle it externally.

let mermaidInstance: typeof import("mermaid").default | null = null;
async function getMermaid() {
  if (!mermaidInstance) {
    const mod = await import("mermaid");
    mermaidInstance = mod.default;
    
    // We can infer theme based on root html classes
    const isDark = document.documentElement.classList.contains("dark") || 
                   document.body.classList.contains("dark") || true; 

    mermaidInstance.initialize({
      startOnLoad: false,
      theme: isDark ? "dark" : "default",
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

// ---------------------------------------------------------
// Stream-Safe Parsing & Lightweight Renderer
// ---------------------------------------------------------

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

function renderStreamingContent(content: string): string {
  if (!content) return "";
  const safeContent = makeStreamSafe(content);
  
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
        segments.push(`<pre><code class="hljs ${codeLang ? `language-${codeLang}` : ""}">\n${escaped}\n</code></pre>`);
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
      segments.push(`<pre><code class="hljs ${codeLang ? `language-${codeLang}` : ""}">\n${escaped}\n</code></pre>`);
    } else {
      segments.push(current);
    }
  }

  const raw = segments.map((seg) => {
    if (seg.startsWith("<pre>")) return seg;

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

  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ["p", "br", "pre", "code", "strong", "h1", "h2", "h3", "h4", "h5", "h6"],
    ALLOWED_ATTR: ["class"],
  });
}

let mermaidIdCounter = 0;

const MarkdownBlock = ({ content = "", isStreaming = false }: MarkdownBlockProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevIsStreamingRef = useRef(isStreaming);

  const renderMermaidDiagrams = useCallback(async () => {
    if (!containerRef.current) return;
    const codeBlocks = containerRef.current.querySelectorAll("pre code");

    for (const codeBlock of codeBlocks) {
      const pre = codeBlock.parentElement;
      if (!pre) continue;
      
      const isMermaid = codeBlock.classList.contains("language-mermaid") || 
                        codeBlock.textContent?.trim().startsWith("flowchart") ||
                        codeBlock.textContent?.trim().startsWith("graph") ||
                        codeBlock.textContent?.trim().startsWith("sequenceDiagram");

      if (!isMermaid || pre.parentElement?.classList.contains("mermaid-rendered")) continue;

      let code = codeBlock.textContent || "";
      code = code.replace(/^```mermaid\s*/i, "").replace(/```\s*$/, "").trim();
      if (!code) continue;

      try {
        const mmd = await getMermaid();
        const id = `mermaid-${++mermaidIdCounter}`;
        
        // Ensure theme matches current dom node just in case it toggled
        const isDark = document.documentElement.classList.contains("dark") || 
                       document.body.classList.contains("dark");
        mmd.initialize({ theme: isDark ? "dark" : "default" });

        const { svg } = await mmd.render(id, code);

        const wrapper = document.createElement("div");
        wrapper.className = "mermaid-rendered flex justify-center py-4 my-4 bg-muted/10 rounded-lg border border-border/20";
        wrapper.innerHTML = svg;
        pre.style.display = "none";
        pre.parentNode?.insertBefore(wrapper, pre);
      } catch (e) {
        console.warn("Mermaid rendering failed", e);
      }
    }
  }, []);

  // Normal complete parsing
  const html = useMemo(() => {
    try {
      if (isStreaming) {
        return renderStreamingContent(content);
      }
      
      const parsed = marked.parse(content);
      const sanitized = DOMPurify.sanitize(
        typeof parsed === "string" ? parsed : String(parsed),
        { ADD_ATTR: ["class"] }
      );
      
      // Inject standard Tailwind typography elements structurally into the raw HTML
      const doc = new DOMParser().parseFromString(sanitized, "text/html");
      doc.querySelectorAll("pre").forEach(pre => {
        pre.className = "p-4 font-mono text-[12.5px] leading-relaxed rounded-lg border border-border/50 bg-[#1e1e2e] shadow-sm my-4 overflow-x-auto overflow-y-hidden max-h-[500px] scrollbar-thin";
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
      
      return doc.body.innerHTML;
    } catch {
      return content;
    }
  }, [content, isStreaming]);

  // Handle post-render actions (diagrams)
  useEffect(() => {
    if (!isStreaming && containerRef.current) {
      if (prevIsStreamingRef.current) {
        // Just finished streaming, wait layout frame then render charts
        requestAnimationFrame(() => renderMermaidDiagrams());
      } else {
        renderMermaidDiagrams();
      }
    }
    prevIsStreamingRef.current = isStreaming;
  }, [html, isStreaming, renderMermaidDiagrams]);

  return (
    <div
      ref={containerRef}
      className="markdown-content w-full whitespace-normal break-words"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default memo(MarkdownBlock);
