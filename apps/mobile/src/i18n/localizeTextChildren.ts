import { Children, type ReactNode } from "react";

type TextLocalizer = (value: string) => string;

/** Localize each visible text run while keeping nested React elements intact. */
export function localizeTextChildren(
  children: ReactNode,
  localizeString: TextLocalizer,
): ReactNode {
  const localizedChildren: ReactNode[] = [];
  let textRun: Array<string | number> = [];

  const flushTextRun = () => {
    if (textRun.length === 0) return;

    const combined = textRun.join("");
    const localizedCombined = localizeString(combined);
    if (localizedCombined !== combined) {
      localizedChildren.push(localizedCombined);
    } else {
      localizedChildren.push(
        ...textRun.map((part) => (typeof part === "string" ? localizeString(part) : part)),
      );
    }
    textRun = [];
  };

  Children.forEach(children, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      textRun.push(child);
      return;
    }
    if (child === null || typeof child === "boolean") return;

    flushTextRun();
    localizedChildren.push(child);
  });
  flushTextRun();

  if (localizedChildren.length === 0) return null;
  return localizedChildren.length === 1 ? localizedChildren[0] : localizedChildren;
}
