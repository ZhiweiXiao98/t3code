import { expect, it } from "vite-plus/test";

import {
  codeLanguageEntry,
  codeLanguageLabel,
  languageOfInfoString,
} from "./composer-code-languages";

it("recognizes plain-text fence info strings without treating metadata as the language", () => {
  const entries = ["Text", "TEXT", "plaintext", "txt"].map((language) =>
    codeLanguageEntry(languageOfInfoString(` ${language} title=notes.txt`)),
  );

  expect(entries).toEqual(Array.from({ length: 4 }, () => ({ id: "", label: "Plain text" })));
});

it("localizes only the plain-text sentinel and aliases, leaving technical names and unknown IDs intact", () => {
  for (const language of ["", "text", "Text", "plaintext", "txt"]) {
    expect(codeLanguageLabel(language)).toBe("Plain text");
    expect(codeLanguageLabel(language, "zh-CN")).toBe("纯文本");
    expect(codeLanguageLabel(language, "en")).toBe("Plain text");
  }
  for (const locale of ["en", "zh-CN"] as const) {
    expect(codeLanguageLabel("ts", locale)).toBe("TypeScript");
    expect(codeLanguageLabel("diff", locale)).toBe("Diff");
    expect(codeLanguageLabel("Plain text", locale)).toBe("Plain text");
    expect(codeLanguageLabel("custom/{language}/$&", locale)).toBe("custom/{language}/$&");
  }
});
