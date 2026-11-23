"use client";

import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export interface XTermHandle {
  write: (data: string) => void;
  writeln: (data: string) => void;
  clear: () => void;
  focus: () => void;
  fit: () => void;
}

interface XTermViewProps {
  onHandleReady?: (handle: XTermHandle) => void;
  onData?: (data: string) => void;
  onSignal?: (signal: "SIGINT") => void;
  onRunRequest?: () => void;
  running?: boolean;
  readOnly?: boolean;
  className?: string;
}

const PROMPT_STR = "\x1b[32mcodelab\x1b[0m \x1b[90m$\x1b[0m ";

export function XTermView({
  onHandleReady,
  onData,
  onSignal,
  onRunRequest,
  running = false,
  readOnly = false,
  className = "",
}: XTermViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lineBufferRef = useRef<string>("");

  // Keep callback refs fresh
  const onHandleReadyRef = useRef(onHandleReady);
  const onDataRef = useRef(onData);
  const onSignalRef = useRef(onSignal);
  const onRunRequestRef = useRef(onRunRequest);
  const runningRef = useRef(running);
  const readOnlyRef = useRef(readOnly);

  useEffect(() => {
    onHandleReadyRef.current = onHandleReady;
    onDataRef.current = onData;
    onSignalRef.current = onSignal;
    onRunRequestRef.current = onRunRequest;
    runningRef.current = running;
    readOnlyRef.current = readOnly;
  });

  useEffect(() => {
    if (!containerRef.current) return;

    // CodeLab light editorial theme matching --color-panel (#ffffff) and --color-fg (#20211f)
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: "var(--font-mono, 'Geist Mono', ui-monospace, Menlo, monospace)",
      fontSize: 12.5,
      lineHeight: 1.45,
      theme: {
        background: "#ffffff",
        foreground: "#20211f",
        cursor: "#26734d",     // CodeLab forest green accent
        cursorAccent: "#ffffff",
        selectionBackground: "rgba(38, 115, 77, 0.18)",
        black: "#20211f",
        red: "#c03d37",
        green: "#26734d",
        yellow: "#945600",
        blue: "#1d67a8",
        magenta: "#7b3fa0",
        cyan: "#0e6b66",
        white: "#e8e8e2",
        brightBlack: "#767971",
        brightRed: "#b8302a",
        brightGreen: "#1f6b43",
        brightYellow: "#7a4600",
        brightBlue: "#15548c",
        brightMagenta: "#672c88",
        brightCyan: "#0a5652",
        brightWhite: "#181916",
      },
      convertEol: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Initial welcome banner so terminal is never an empty blank box
    term.writeln("\x1b[1mCodeLab Terminal\x1b[0m — isolated Docker execution");
    term.writeln("\x1b[90mClick \x1b[32m▶ Run\x1b[90m (or press \x1b[1m⌘Enter\x1b[90m) to execute your Go, TypeScript, C++, Python, or JavaScript code.\x1b[0m\r\n");
    term.write(PROMPT_STR);

    // Handle user keystrokes in xterm
    const dataSub = term.onData((data) => {
      // If running and in observer mode (read-only), ignore stdin input
      if (runningRef.current && readOnlyRef.current) {
        return;
      }
      // Check for Ctrl+C (ASCII 3 / \x03)
      if (data === "\x03") {
        lineBufferRef.current = "";
        term.write("^C\r\n");
        if (runningRef.current) {
          onSignalRef.current?.("SIGINT");
        } else {
          term.write(PROMPT_STR);
        }
        return;
      }

      // Backspace handling (\x7f on Mac/Linux or \b)
      if (data === "\x7f" || data === "\b") {
        if (lineBufferRef.current.length > 0) {
          lineBufferRef.current = lineBufferRef.current.slice(0, -1);
          // Visually erase the character: move back, space, move back
          term.write("\b \b");
          if (runningRef.current) {
            onDataRef.current?.("\b");
          }
        }
        return;
      }

      // Enter key
      if (data === "\r" || data === "\n" || data === "\r\n") {
        term.write("\r\n");
        const cmd = lineBufferRef.current.trim();
        lineBufferRef.current = "";

        if (runningRef.current) {
          onDataRef.current?.("\n");
          return;
        }

        // Idle shell commands
        if (!cmd) {
          term.write(PROMPT_STR);
          return;
        }

        if (cmd === "clear") {
          term.clear();
          term.write(PROMPT_STR);
          return;
        }

        if (cmd === "help") {
          term.writeln("\x1b[1mAvailable commands:\x1b[0m");
          term.writeln("  \x1b[32mrun\x1b[0m     Execute the current Go, TypeScript, C++, Python, or JavaScript file");
          term.writeln("  \x1b[32mclear\x1b[0m   Clear the terminal screen");
          term.writeln("  \x1b[32mhelp\x1b[0m    Show this help message");
          term.writeln("\x1b[90mTip: You can also click ▶ Run or press ⌘Enter in the editor.\x1b[0m\r\n");
          term.write(PROMPT_STR);
          return;
        }

        if (cmd === "run") {
          onRunRequestRef.current?.();
          return;
        }

        term.writeln(`codelab: command not found: \x1b[31m${cmd}\x1b[0m. Type \x1b[32mrun\x1b[0m or click \x1b[32m▶ Run\x1b[0m.`);
        term.write(PROMPT_STR);
        return;
      }

      // Ignore bare escape sequences (e.g. arrow keys) when idle
      if (data.startsWith("\x1b") && !runningRef.current) {
        return;
      }

      // Printable characters
      lineBufferRef.current += data;
      term.write(data);
      if (runningRef.current) {
        onDataRef.current?.(data);
      }
    });

    // Provide handle to parent
    onHandleReadyRef.current?.({
      write: (text: string) => {
        lineBufferRef.current = "";
        term.write(text);
      },
      writeln: (text: string) => {
        lineBufferRef.current = "";
        term.writeln(text);
      },
      clear: () => {
        lineBufferRef.current = "";
        term.clear();
        term.reset();
        term.write(PROMPT_STR);
      },
      focus: () => {
        term.focus();
      },
      fit: () => {
        try {
          fitAddon.fit();
        } catch {}
      },
    });

    // Auto-fit on resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {}
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      dataSub.dispose();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`h-full w-full overflow-hidden bg-panel p-2.5 ${className}`}
      onClick={() => termRef.current?.focus()}
    />
  );
}
