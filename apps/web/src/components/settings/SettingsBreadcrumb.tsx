import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { useI18n } from "../../i18n/WebI18nProvider";
import { translateWebSource } from "../../i18n/messages";
import { SETTINGS_SECTION_LABELS } from "./settingsSearch";

const SETTINGS_BREADCRUMB_LABELS: Readonly<Record<string, string>> = {
  ...SETTINGS_SECTION_LABELS,
  "/settings/diagnostics": "Diagnostics",
};

function settingsBreadcrumbLabel(pathname: string): string | null {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return SETTINGS_BREADCRUMB_LABELS[normalizedPathname] ?? null;
}

export function SettingsBreadcrumb({ pathname }: { pathname: string }) {
  const { locale, t } = useI18n();
  const sourceSectionLabel = settingsBreadcrumbLabel(pathname);
  const sectionLabel =
    sourceSectionLabel === null ? null : translateWebSource(locale, sourceSectionLabel);

  return (
    <WorkspaceBreadcrumb ariaLabel={t("settings.breadcrumb")}>
      {sectionLabel ? (
        <>
          <WorkspaceBreadcrumbItem>{t("settings.title")}</WorkspaceBreadcrumbItem>
          <WorkspaceBreadcrumbSeparator />
        </>
      ) : null}
      <WorkspaceBreadcrumbItem current className="truncate">
        {sectionLabel ?? t("settings.title")}
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  );
}
