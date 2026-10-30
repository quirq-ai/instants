// A tiny line tokenizer for syntax-ish highlighting on code slides.
// Good enough for JS/TS, Python, Rust, Go, shell, SQL and JSON at a glance.

export type Token = { kind: "kw" | "str" | "com" | "num" | "fn" | "txt" | "punct"; text: string };

const KEYWORDS = new Set(
  (
    "const let var function return if else for while do switch case break continue new class extends import export from default async await yield try catch finally throw typeof instanceof in of " +
    "def lambda pass with as elif is not and or None True False self print " +
    "fn let mut pub struct enum impl trait use mod match loop where " +
    "func package go defer chan map type interface range " +
    "select insert update delete where join on group by order limit create table values into " +
    "true false null undefined void this super static public private protected readonly"
  ).split(" "),
);

const RE = /(\/\/.*$|#(?!!).*$|--\s.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d[\d_.]*(?:e[+-]?\d+)?[a-z%]*\b)|([A-Za-z_$][\w$]*)|([{}()[\];,.:=<>+\-*/!&|?%^~@]+)|(\s+)|(.)/gim;

export function tokenize(line: string, lang = ""): Token[] {
  const hashComments = /py|sh|bash|zsh|yaml|yml|toml|ruby|rb|r$|make|docker/i.test(lang) || !/js|ts|jsx|tsx|rust|go|c|java|swift|kotlin|css|json|sql/i.test(lang);
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  RE.lastIndex = 0;
  while ((m = RE.exec(line))) {
    const [text, com, str, num, word, punct] = m;
    if (com) {
      const notComment = com.startsWith("#") ? !hashComments : com.startsWith("--") && !/sql|lua|hs|haskell/i.test(lang);
      if (notComment) {
        out.push({ kind: "punct", text: com[0] });
        RE.lastIndex = m.index + 1;
        continue;
      }
      out.push({ kind: "com", text: com });
      break;
    }
    if (str) out.push({ kind: "str", text: str });
    else if (num) out.push({ kind: "num", text: num });
    else if (word) {
      const next = line.slice(m.index + word.length).trimStart()[0];
      out.push({ kind: KEYWORDS.has(lang.toLowerCase() === "sql" ? word.toLowerCase() : word) ? "kw" : next === "(" ? "fn" : "txt", text: word });
    } else if (punct) out.push({ kind: "punct", text: punct });
    else out.push({ kind: "txt", text });
  }
  return out;
}
