import type { ComponentProps } from "react";
import { useI18n } from "../../i18n/WebI18nContext";
import { translateWebSource } from "../../i18n/messages";
import { OpenAI } from "../Icons";
import { Button } from "../ui/button";

export function ChatGptConnectionButton({ children, ...props }: ComponentProps<typeof Button>) {
  const { locale } = useI18n();
  return (
    <Button {...props}>
      <OpenAI className="size-4 shrink-0" aria-hidden="true" />
      {children ?? translateWebSource(locale, "Continue with ChatGPT")}
    </Button>
  );
}
