import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { useI18n } from "../../i18n/WebI18nProvider";
import type { WebMessageKey } from "../../i18n/messages";
import { SETTINGS_SECTION_MESSAGE_KEYS } from "./settingsSearch";

const SETTINGS_BREADCRUMB_MESSAGE_KEYS: Readonly<Record<string, WebMessageKey>> = {
  ...SETTINGS_SECTION_MESSAGE_KEYS,
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
