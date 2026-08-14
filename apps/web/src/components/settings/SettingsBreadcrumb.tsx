import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { useI18n } from "../../i18n/WebI18nProvider";
import type { WebMessageKey } from "../../i18n/messages";

const SETTINGS_BREADCRUMB_MESSAGE_KEYS: Readonly<Record<string, WebMessageKey>> = {
  "/settings/general": "settings.section.general",
  "/settings/appearance": "settings.section.appearance",
  "/settings/keybindings": "settings.section.keybindings",
  "/settings/providers": "settings.section.providers",
  "/settings/source-control": "settings.section.sourceControl",
  "/settings/connections": "settings.section.connections",
  "/settings/archived": "settings.section.archive",
  "/settings/diagnostics": "settings.diagnostics",
};

function settingsBreadcrumbMessageKey(pathname: string): WebMessageKey | null {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return SETTINGS_BREADCRUMB_MESSAGE_KEYS[normalizedPathname] ?? null;
}

export function SettingsBreadcrumb({ pathname }: { pathname: string }) {
  const { t } = useI18n();
  const sectionMessageKey = settingsBreadcrumbMessageKey(pathname);

  return (
    <WorkspaceBreadcrumb ariaLabel={t("settings.breadcrumb")}>
      {sectionMessageKey ? (
        <>
          <WorkspaceBreadcrumbItem>{t("settings.title")}</WorkspaceBreadcrumbItem>
          <WorkspaceBreadcrumbSeparator />
        </>
      ) : null}
      <WorkspaceBreadcrumbItem current className="truncate">
        {sectionMessageKey ? t(sectionMessageKey) : t("settings.title")}
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  );
}
