/**
 * One-time Monaco setup. Imported only by the client-only editor module, so
 * none of this runs during server rendering.
 *
 * - Monaco is bundled from node_modules (no CDN, works offline).
 * - Language services run in web workers built from ./workers.
 * - TypeScript semantic checks are off: the demo files import modules that
 *   don't exist in this sandbox, so semantic errors would be noise. Syntax
 *   errors are still reported.
 */
import * as monaco from "monaco-editor";

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

window.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case "typescript":
      case "javascript":
        return new Worker(new URL("./workers/ts.worker.ts", import.meta.url), {
          type: "module",
          name: "ts-worker",
        });
      case "json":
        return new Worker(new URL("./workers/json.worker.ts", import.meta.url), {
          type: "module",
          name: "json-worker",
        });
      case "css":
      case "scss":
      case "less":
        return new Worker(new URL("./workers/css.worker.ts", import.meta.url), {
          type: "module",
          name: "css-worker",
        });
      case "html":
      case "handlebars":
      case "razor":
        return new Worker(new URL("./workers/html.worker.ts", import.meta.url), {
          type: "module",
          name: "html-worker",
        });
      default:
        return new Worker(new URL("./workers/editor.worker.ts", import.meta.url), {
          type: "module",
          name: "editor-worker",
        });
    }
  },
};

const ts = monaco.typescript;
for (const defaults of [ts.typescriptDefaults, ts.javascriptDefaults]) {
  defaults.setCompilerOptions({
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    allowNonTsExtensions: true,
    strict: true,
    noEmit: true,
  });
  defaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });
}

/** Light theme matching the CodeLab syntax tokens in globals.css. */
export const THEME = "codelab-light";

monaco.editor.defineTheme(THEME, {
  base: "vs",
  inherit: true,
  rules: [
    { token: "", foreground: "20211F" },
    { token: "comment", foreground: "7E8079", fontStyle: "italic" },
    { token: "keyword", foreground: "7B3FA0" },
    { token: "keyword.flow", foreground: "7B3FA0" },
    { token: "string", foreground: "0E6B66" },
    { token: "string.escape", foreground: "0A5450" },
    { token: "regexp", foreground: "B03656" },
    { token: "number", foreground: "B0501A" },
    { token: "type", foreground: "8F5C00" },
    { token: "type.identifier", foreground: "8F5C00" },
    { token: "identifier", foreground: "20211F" },
    { token: "delimiter", foreground: "6D6F69" },
    { token: "delimiter.bracket", foreground: "4B4D48" },
    { token: "operator", foreground: "6D6F69" },
    // JSX / HTML
    { token: "tag", foreground: "B03656" },
    { token: "metatag", foreground: "7B3FA0" },
    { token: "attribute.name", foreground: "3F5A70" },
    { token: "attribute.value", foreground: "0E6B66" },
    // CSS
    { token: "attribute.name.css", foreground: "3F5A70" },
    { token: "attribute.value.css", foreground: "B0501A" },
    { token: "tag.css", foreground: "B03656" },
    { token: "keyword.css", foreground: "7B3FA0" },
    // JSON
    { token: "string.key.json", foreground: "3F5A70" },
    { token: "string.value.json", foreground: "0E6B66" },
    { token: "keyword.json", foreground: "7B3FA0" },
    // Markdown
    { token: "keyword.md", foreground: "7B3FA0", fontStyle: "bold" },
    { token: "strong", fontStyle: "bold" },
    { token: "emphasis", fontStyle: "italic" },
    { token: "variable", foreground: "2B5EA7" },
    { token: "string.link", foreground: "2B5EA7" },
  ],
  colors: {
    "editor.background": "#FFFFFF",
    "editor.foreground": "#20211F",
    "editorLineNumber.foreground": "#A9AAA3",
    "editorLineNumber.activeForeground": "#4B4D48",
    "editor.lineHighlightBackground": "#F6F6F1",
    "editor.lineHighlightBorder": "#00000000",
    "editorCursor.foreground": "#26734D",
    "editor.selectionBackground": "#26734D2E",
    "editor.inactiveSelectionBackground": "#26734D1A",
    "editor.selectionHighlightBackground": "#26734D14",
    "editor.wordHighlightBackground": "#20211F0D",
    "editor.findMatchBackground": "#F2D78F",
    "editor.findMatchHighlightBackground": "#F2D78F80",
    "editorIndentGuide.background1": "#EDEDE7",
    "editorIndentGuide.activeBackground1": "#D9D9D2",
    "editorWhitespace.foreground": "#D9D9D2",
    "editorBracketHighlight.foreground1": "#4B4D48",
    "editorBracketHighlight.foreground2": "#4B4D48",
    "editorBracketHighlight.foreground3": "#4B4D48",
    "editorBracketHighlight.foreground4": "#4B4D48",
    "editorBracketHighlight.foreground5": "#4B4D48",
    "editorBracketHighlight.foreground6": "#4B4D48",
    "editorBracketMatch.background": "#26734D14",
    "editorBracketMatch.border": "#26734D59",
    "editorGutter.background": "#FFFFFF",
    "editorError.foreground": "#C03D37",
    "editorWarning.foreground": "#A2620B",
    "editorWidget.background": "#FFFFFF",
    "editorWidget.border": "#E8E8E2",
    "editorSuggestWidget.background": "#FFFFFF",
    "editorSuggestWidget.border": "#E8E8E2",
    "editorSuggestWidget.selectedBackground": "#EDF5F0",
    "editorHoverWidget.background": "#FFFFFF",
    "editorHoverWidget.border": "#E8E8E2",
    "scrollbarSlider.background": "#20211F1F",
    "scrollbarSlider.hoverBackground": "#20211F33",
    "scrollbarSlider.activeBackground": "#20211F47",
    "focusBorder": "#26734D80",
  },
});

export { monaco };
