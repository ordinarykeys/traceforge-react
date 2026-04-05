import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api";

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

let monacoPromise: Promise<typeof Monaco> | null = null;
let easyLanguageRegistered = false;

function registerEasyLanguage(monaco: typeof Monaco) {
  if (easyLanguageRegistered) {
    return;
  }

  easyLanguageRegistered = true;

  monaco.languages.register({ id: "easy-language" });
  monaco.languages.setLanguageConfiguration("easy-language", {
    autoClosingPairs: [
      { open: "(", close: ")" },
      { open: "[", close: "]" },
      { open: '"', close: '"' },
    ],
    brackets: [
      ["(", ")"],
      ["[", "]"],
    ],
    comments: {
      lineComment: "'",
    },
  });

  monaco.languages.setMonarchTokensProvider("easy-language", {
    tokenizer: {
      root: [
        [/^\s*\.[^\s,，]+/, "directive"],
        [/'[^$]*/, "comment"],
        [/#[_\u4e00-\u9fa5A-Za-z0-9]+/, "constant"],
        [/"([^"\\]|\\.)*"/, "string"],
        [/[()]/, "@brackets"],
        [/[=＝,+\-*/]/, "operator"],
        [/\b\d+(?:\.\d+)?\b/, "number"],
        [/\b(?:如果真|如果真结束|返回|公开|静态|数组|真|假)\b/, "keyword"],
        [/[A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*/, "identifier"],
      ],
    },
  });

  monaco.editor.defineTheme("wt-easy-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "directive", foreground: "0b5394", fontStyle: "bold" },
      { token: "comment", foreground: "2e7d32" },
      { token: "string", foreground: "a31515" },
      { token: "constant", foreground: "7b1fa2" },
      { token: "operator", foreground: "5f6368" },
      { token: "number", foreground: "1a73e8" },
      { token: "keyword", foreground: "0b5394", fontStyle: "bold" },
      { token: "identifier", foreground: "202124" },
    ],
    colors: {
      "editor.background": "#fffefc",
      "editor.foreground": "#1f2329",
      "editor.lineHighlightBackground": "#f6f8fb",
      "editor.selectionBackground": "#dce8ff",
      "editorCursor.foreground": "#2f5ea8",
      "editorWhitespace.foreground": "#e2e7ee",
      "editorIndentGuide.background1": "#eef2f7",
      "editorLineNumber.foreground": "#c0c8d4",
      "editorLineNumber.activeForeground": "#7d8796",
    },
  });

  monaco.editor.defineTheme("wt-easy-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "directive", foreground: "8ab4f8", fontStyle: "bold" },
      { token: "comment", foreground: "7fb77e" },
      { token: "string", foreground: "f28b82" },
      { token: "constant", foreground: "d0a8ff" },
      { token: "operator", foreground: "9aa0a6" },
      { token: "number", foreground: "8ab4f8" },
      { token: "keyword", foreground: "8ab4f8", fontStyle: "bold" },
      { token: "identifier", foreground: "e8eaed" },
    ],
    colors: {
      "editor.background": "#101723",
      "editor.foreground": "#e8eaed",
      "editor.lineHighlightBackground": "#182334",
      "editor.selectionBackground": "#22406f",
      "editorCursor.foreground": "#a8c7fa",
      "editorWhitespace.foreground": "#263448",
      "editorIndentGuide.background1": "#233247",
      "editorLineNumber.foreground": "#4f6179",
      "editorLineNumber.activeForeground": "#8b9ab1",
    },
  });
}

export function loadMonaco() {
  if (!monacoPromise) {
    monacoPromise = import("monaco-editor/esm/vs/editor/editor.api").then(async (monaco) => {
      await import("monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution");

      const scopedSelf = self as typeof globalThis & {
        MonacoEnvironment?: {
          getWorker: (_workerId: string, label: string) => Worker;
        };
      };

      scopedSelf.MonacoEnvironment = {
        getWorker() {
          return new editorWorker();
        },
      };

      registerEasyLanguage(monaco);
      return monaco;
    });
  }

  return monacoPromise;
}
