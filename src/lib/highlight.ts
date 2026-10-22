/**
 * Minimal, dependency-free syntax tokenizer for the Phase 1 editor preview.
 * It is intentionally approximate — Monaco replaces it in a later phase.
 * Output is plain token data (no HTML), so rendering stays XSS-safe.
 */

export type TokenType =
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "function"
  | "type"
  | "tag"
  | "property"
  | "punct"
  | "plain";

export interface Token {
  type: TokenType;
  text: string;
}

export type LanguageId = "tsx" | "ts" | "css" | "json" | "markdown" | "plain";

export function languageFromPath(path: string): LanguageId {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "tsx":
    case "jsx":
      return "tsx";
    case "ts":
    case "js":
    case "mjs":
      return "ts";
    case "css":
      return "css";
    case "json":
      return "json";
    case "md":
      return "markdown";
    default:
      return "plain";
  }
}

export const languageLabel: Record<LanguageId, string> = {
  tsx: "TypeScript JSX",
  ts: "TypeScript",
  css: "CSS",
  json: "JSON",
  markdown: "Markdown",
  plain: "Plain Text",
};

const TS_KEYWORDS = new Set([
  "import", "from", "export", "default", "function", "return", "const", "let",
  "var", "if", "else", "for", "of", "in", "while", "async", "await", "new",
  "type", "interface", "extends", "implements", "class", "as", "throw", "try",
  "catch", "finally", "typeof", "keyof", "void", "null", "undefined", "true",
  "false", "this", "switch", "case", "break", "continue", "readonly", "satisfies",
]);

const TS_TYPES = new Set(["string", "number", "boolean", "unknown", "never", "any"]);

interface State {
  inBlockComment: boolean;
  inFence?: boolean;
}

type Rule = [RegExp, TokenType | ((m: string, rest: string, prev: Token | undefined) => TokenType)];

function run(line: string, rules: Rule[]): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  outer: while (i < line.length) {
    for (const [re, type] of rules) {
      re.lastIndex = i;
      const m = re.exec(line);
      if (m && m.index === i && m[0].length > 0) {
        const prev = tokens[tokens.length - 1];
        const t = typeof type === "function" ? type(m[0], line.slice(i + m[0].length), prev) : type;
        push(tokens, t, m[0]);
        i += m[0].length;
        continue outer;
      }
    }
    push(tokens, "punct", line[i]);
    i += 1;
  }
  return tokens;
}

function push(tokens: Token[], type: TokenType, text: string) {
  const last = tokens[tokens.length - 1];
  if (last && last.type === type && (type === "plain" || type === "punct")) {
    last.text += text;
  } else {
    tokens.push({ type, text });
  }
}

const tsRules = (jsx: boolean): Rule[] => [
  [/\s+/y, "plain"],
  [/\/\/.*/y, "comment"],
  [/"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?/y, "string"],
  [/=>/y, "keyword"],
  ...(jsx ? ([[/<\/?[A-Za-z][\w.]*|\/>/y, "tag"]] as Rule[]) : []),
  [/\b\d[\d_]*(?:\.\d+)?\b/y, "number"],
  [
    /[A-Za-z_$][\w$]*/y,
    (word, rest, prev) => {
      if (TS_KEYWORDS.has(word)) return "keyword";
      if (TS_TYPES.has(word)) return "type";
      if (prev?.text.endsWith(".")) return /^\s*\(/.test(rest) ? "function" : "property";
      if (/^\s*\(/.test(rest)) return "function";
      if (/^[A-Z]/.test(word)) return "type";
      if (jsx && /^=/.test(rest)) return "property";
      return "plain";
    },
  ],
];

const cssRules: Rule[] = [
  [/\s+/y, "plain"],
  [/"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?/y, "string"],
  [/@[\w-]+/y, "keyword"],
  [/#[0-9a-fA-F]{3,8}\b/y, "number"],
  [/-?\d*\.?\d+(?:px|rem|em|%|ms|s|vh|vw|fr)?/y, "number"],
  [/--[\w-]+/y, "property"],
  [/[\w-]+(?=\s*:(?!:))/y, "property"],
  [/[\w-]+(?=\()/y, "function"],
  [/[.#]?[\w-]+/y, "tag"],
];

const jsonRules: Rule[] = [
  [/\s+/y, "plain"],
  [/"(?:[^"\\]|\\.)*"(?=\s*:)/y, "property"],
  [/"(?:[^"\\]|\\.)*"?/y, "string"],
  [/-?\d+(?:\.\d+)?/y, "number"],
  [/\b(?:true|false|null)\b/y, "keyword"],
];

const mdInlineRules: Rule[] = [
  [/`[^`]*`?/y, "string"],
  [/\*\*[^*]+\*\*/y, "type"],
  [/\[[^\]]*\]\([^)]*\)/y, "function"],
  [/[^`*[]+/y, "plain"],
];

export function tokenizeLine(
  line: string,
  lang: LanguageId,
  state: State,
): { tokens: Token[]; state: State } {
  if (lang === "plain") return { tokens: [{ type: "plain", text: line }], state };

  if (lang === "markdown") {
    if (/^\s*```/.test(line)) {
      return { tokens: [{ type: "comment", text: line }], state: { ...state, inFence: !state.inFence } };
    }
    if (state.inFence) return { tokens: [{ type: "string", text: line }], state };
    if (/^#{1,6}\s/.test(line)) return { tokens: [{ type: "keyword", text: line }], state };
    const list = /^(\s*[-*+]|\s*\d+\.)\s/.exec(line);
    if (list) {
      return {
        tokens: [{ type: "tag", text: list[0] }, ...run(line.slice(list[0].length), mdInlineRules)],
        state,
      };
    }
    return { tokens: run(line, mdInlineRules), state };
  }

  // Block comments (TS / CSS) may span lines.
  const tokens: Token[] = [];
  let rest = line;
  let inBlock = state.inBlockComment;
  if (lang !== "json") {
    while (rest.length) {
      if (inBlock) {
        const end = rest.indexOf("*/");
        if (end === -1) {
          tokens.push({ type: "comment", text: rest });
          rest = "";
          break;
        }
        tokens.push({ type: "comment", text: rest.slice(0, end + 2) });
        rest = rest.slice(end + 2);
        inBlock = false;
        continue;
      }
      const start = rest.indexOf("/*");
      // Avoid treating "/*" inside strings or line comments as a block start.
      const lineComment = rest.indexOf("//");
      if (start === -1 || (lineComment !== -1 && lineComment < start) || inString(rest, start)) {
        break;
      }
      tokens.push(...tokenizeCode(rest.slice(0, start), lang));
      rest = rest.slice(start);
      inBlock = true;
    }
  }
  if (rest.length) tokens.push(...tokenizeCode(rest, lang));
  return { tokens, state: { ...state, inBlockComment: inBlock } };
}

function inString(text: string, index: number) {
  const before = text.slice(0, index);
  const quotes = (before.match(/["'`]/g) ?? []).length;
  return quotes % 2 === 1;
}

function tokenizeCode(text: string, lang: LanguageId): Token[] {
  if (!text) return [];
  switch (lang) {
    case "tsx":
      return run(text, tsRules(true));
    case "ts":
      return run(text, tsRules(false));
    case "css":
      return run(text, cssRules);
    case "json":
      return run(text, jsonRules);
    default:
      return [{ type: "plain", text }];
  }
}

export function tokenize(source: string, lang: LanguageId): Token[][] {
  let state: State = { inBlockComment: false };
  return source.split("\n").map((line) => {
    const result = tokenizeLine(line, lang, state);
    state = result.state;
    return result.tokens;
  });
}

export const tokenClass: Record<TokenType, string> = {
  keyword: "text-syn-keyword",
  string: "text-syn-string",
  number: "text-syn-number",
  comment: "text-syn-comment italic",
  function: "text-syn-function",
  type: "text-syn-type",
  tag: "text-syn-tag",
  property: "text-syn-property",
  punct: "text-syn-punct",
  plain: "text-syn-plain",
};
