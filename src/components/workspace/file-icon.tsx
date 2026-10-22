import { Braces, CodeXml, FileCode2, FileText, Hash, Palette, Settings2 } from "lucide-react";
import { cn } from "@/lib/cn";

export function FileIcon({ path, className }: { path: string; className?: string }) {
  const name = path.split("/").pop() ?? path;
  const ext = name.split(".").pop()?.toLowerCase();
  const cls = cn(className ?? "h-4 w-4", "shrink-0");

  if (name === "package.json" || name === "tsconfig.json")
    return <Settings2 className={cn(cls, "text-[#a87410]")} />;
  switch (ext) {
    case "tsx":
    case "jsx":
      return <FileCode2 className={cn(cls, "text-[#2f74c0]")} />;
    case "ts":
      return <FileCode2 className={cn(cls, "text-[#3a62b0]")} />;
    case "js":
    case "mjs":
      return <FileCode2 className={cn(cls, "text-[#a88300]")} />;
    case "html":
      return <CodeXml className={cn(cls, "text-[#c0562a]")} />;
    case "css":
      return <Palette className={cn(cls, "text-[#8250c4]")} />;
    case "json":
      return <Braces className={cn(cls, "text-[#a87410]")} />;
    case "md":
      return <FileText className={cn(cls, "text-fg-muted")} />;
    default:
      return <Hash className={cn(cls, "text-fg-subtle")} />;
  }
}
