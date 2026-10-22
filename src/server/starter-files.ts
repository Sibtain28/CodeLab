import "server-only";
import type { Language } from "@/lib/projects";

/** Files every new project starts with, by language. Plain text only. */
export function starterFiles(name: string, language: Language): { path: string; content: string }[] {
  const readme = `# ${name}\n\nCreated with CodeLab.\n\n- Press **⌘S** (Ctrl+S) to save the open file.\n- Running code is simulated for now.\n`;
  switch (language) {
    case "TypeScript":
      return [
        { path: "README.md", content: readme },
        {
          path: "package.json",
          content: JSON.stringify(
            { name, private: true, version: "0.1.0", scripts: { dev: "next dev", build: "next build" } },
            null,
            2,
          ) + "\n",
        },
        {
          path: "src/app/page.tsx",
          content: `import { greet } from "../lib/greet";\n\nexport default function Page() {\n  return <h1>{greet("CodeLab")}</h1>;\n}\n`,
        },
        {
          path: "src/lib/greet.ts",
          content: `export function greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\n`,
        },
      ];
    case "JavaScript":
      return [
        { path: "README.md", content: readme },
        {
          path: "package.json",
          content: JSON.stringify({ name, private: true, version: "0.1.0", type: "module", main: "src/index.js" }, null, 2) + "\n",
        },
        { path: "src/index.js", content: `const name = "CodeLab";\n\nconsole.log(\`Hello, \${name}!\`);\n` },
      ];
    case "Python":
      return [
        { path: "README.md", content: readme },
        { path: "main.py", content: `def greet(name: str) -> str:\n    return f"Hello, {name}!"\n\n\nif __name__ == "__main__":\n    print(greet("CodeLab"))\n` },
        { path: "requirements.txt", content: "" },
      ];
    case "Go":
      return [
        { path: "README.md", content: readme },
        { path: "go.mod", content: `module ${name}\n\ngo 1.23\n` },
        { path: "main.go", content: `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, CodeLab!")\n}\n` },
      ];
    case "Rust":
      return [
        { path: "README.md", content: readme },
        { path: "Cargo.toml", content: `[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2021"\n` },
        { path: "src/main.rs", content: `fn main() {\n    println!("Hello, CodeLab!");\n}\n` },
      ];
  }
}
