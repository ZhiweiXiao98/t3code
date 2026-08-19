import {
  ExternalLinkIcon,
  PaletteIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/WebI18nProvider";
import {
  importOpenVsxThemeExtension,
  searchOpenVsxThemes,
  type OpenVsxThemeExtension,
  type OpenVsxThemeSort,
} from "../../openVsxThemes";
import {
  getCustomThemes,
  getStoredCustomThemeCollection,
  replaceCustomThemeCollection,
  type ThemeDefinition,
} from "../../themePalette";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";

const DOWNLOAD_FORMAT = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});
const SUGGESTED_SEARCHES = ["Dracula", "Catppuccin", "Nord", "Tokyo Night"];
const SORT_OPTION_MESSAGE_KEYS = {
  downloadCount: "appearance.theme.search.sort.downloaded",
  rating: "appearance.theme.search.sort.rated",
  timestamp: "appearance.theme.search.sort.newest",
  relevance: "appearance.theme.search.sort.relevant",
} as const;

function ThemeExtensionIcon({ extension }: { extension: OpenVsxThemeExtension }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
      {extension.iconUrl && !failed ? (
        <img
          alt=""
          className="size-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          src={extension.iconUrl}
          onError={() => setFailed(true)}
        />
      ) : (
        <PaletteIcon className="size-4" />
      )}
    </div>
  );
}

export function ThemeSearchSection({
  open,
  onInstalled,
}: {
  open: boolean;
  onInstalled: (themes: ReadonlyArray<ThemeDefinition>, context: { updated: boolean }) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<OpenVsxThemeSort>("downloadCount");
  const [results, setResults] = useState<ReadonlyArray<OpenVsxThemeExtension> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<OpenVsxThemeExtension | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    if (open) {
      setQuery("");
      setSortBy("downloadCount");
      setResults(null);
      setError(null);
      setIsSearching(false);
      setInstallingId(null);
      setPendingUpdate(null);
    }
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [open]);

  const runSearch = useCallback(
    async (searchText: string, nextSort = sortBy) => {
      const trimmed = searchText.trim();
      if (!trimmed) return;
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setQuery(trimmed);
      setIsSearching(true);
      setError(null);
      setResults(null);
      try {
        const nextResults = await searchOpenVsxThemes(trimmed, {
          signal: controller.signal,
          sortBy: nextSort,
        });
        if (!controller.signal.aborted) setResults(nextResults);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Open VSX search failed.");
        }
      }
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsSearching(false);
      }
    },
    [sortBy],
  );

  const handleSearch = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void runSearch(query);
    },
    [query, runSearch],
  );

  const handleSortChange = useCallback(
    (value: OpenVsxThemeSort | null) => {
      const nextSort =
        value !== null && value in SORT_OPTION_MESSAGE_KEYS
          ? (value as OpenVsxThemeSort)
          : undefined;
      if (!nextSort) return;
      setSortBy(nextSort);
      if ((results !== null || isSearching) && query.trim()) {
        void runSearch(query, nextSort);
      }
    },
    [isSearching, query, results, runSearch],
  );

  const handleInstall = useCallback(
    async (extension: OpenVsxThemeExtension, allowUpdate: boolean) => {
      setError(null);
      let installedCollection: ReadonlyArray<ThemeDefinition>;
      try {
        installedCollection = getStoredCustomThemeCollection(extension.collectionId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Installed themes could not be read.");
        return;
      }
      const updated = installedCollection.length > 0;
      if (updated && !allowUpdate) {
        setPendingUpdate(extension);
        return;
      }

      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setInstallingId(extension.id);
      try {
        const themes = await importOpenVsxThemeExtension(extension, controller.signal);
        if (!controller.signal.aborted) {
          const imported = replaceCustomThemeCollection(extension.collectionId, themes, {
            expectedCollection: installedCollection,
          });
          onInstalled(imported, { updated });
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "That theme could not be added.");
        }
      }
      if (requestRef.current === controller) {
        requestRef.current = null;
        setInstallingId(null);
      }
    },
    [onInstalled],
  );

  return (
    <section className="space-y-3" aria-labelledby="theme-search-heading">
      <div>
        <h3 className="text-sm font-medium" id="theme-search-heading">
          {t("appearance.theme.search.title")}
        </h3>
        <p className="mt-0.5 text-muted-foreground text-xs">
          {t("appearance.theme.search.description")}
        </p>
      </div>
      <form className="flex gap-2" onSubmit={handleSearch}>
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={t("appearance.theme.search.label")}
            autoFocus
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={t("appearance.theme.search.placeholder")}
            size="lg"
            type="search"
            value={query}
          />
        </InputGroup>
        <Button
          disabled={!query.trim() || isSearching || installingId !== null}
          size="lg"
          type="submit"
          variant="outline"
        >
          {isSearching ? <Spinner /> : <SearchIcon />}
          {t("appearance.theme.search.action")}
        </Button>
      </form>

      {!isSearching ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <p className="text-muted-foreground text-xs">{t("appearance.theme.search.popular")}</p>
            {SUGGESTED_SEARCHES.map((suggestion) => (
              <Button
                key={suggestion}
                size="xs"
                variant="ghost"
                onClick={() => void runSearch(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
          {results && results.length > 0 ? (
            <div className="flex shrink-0 items-center justify-end gap-2">
              <p className="text-muted-foreground text-xs">{t("appearance.theme.search.sort")}</p>
              <Select
                disabled={installingId !== null}
                value={sortBy}
                onValueChange={handleSortChange}
              >
                <SelectTrigger
                  size="sm"
                  className="w-40"
                  aria-label={t("appearance.theme.search.sortLabel")}
                >
                  <SelectValue>{t(SORT_OPTION_MESSAGE_KEYS[sortBy])}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {(
                    Object.entries(SORT_OPTION_MESSAGE_KEYS) as Array<
                      [OpenVsxThemeSort, (typeof SORT_OPTION_MESSAGE_KEYS)[OpenVsxThemeSort]]
                    >
                  ).map(([value, messageKey]) => (
                    <SelectItem key={value} hideIndicator value={value}>
                      {t(messageKey)}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="sr-only" role="status">
        {isSearching
          ? "Finding themes..."
          : results
            ? `${results.length} supported ${results.length === 1 ? "theme" : "themes"} found.`
            : ""}
      </div>

      {error ? (
        <div
          aria-live="polite"
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm"
        >
          {error}
        </div>
      ) : null}

      {isSearching ? (
        <div className="flex min-h-20 items-center justify-center gap-2 text-muted-foreground text-sm">
          <Spinner /> {t("appearance.theme.search.finding")}
        </div>
      ) : null}

      {results ? (
        results.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed text-center">
            <p className="text-sm font-medium">{t("appearance.theme.search.empty")}</p>
            <p className="mt-1 text-muted-foreground text-xs">
              {t("appearance.theme.search.tryBroader")}
            </p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {results.map((extension) => {
              const isInstalling = installingId === extension.id;
              const isInstalled = getCustomThemes().some(
                (theme) => theme.collection?.id === extension.collectionId,
              );
              const action = isInstalled
                ? t("appearance.theme.search.update")
                : t("appearance.theme.search.add");
              const progressAction = isInstalled
                ? t("appearance.theme.search.updating")
                : t("appearance.theme.search.adding");
              return (
                <article
                  className="group flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-card/60 p-3 transition-colors hover:bg-accent/20"
                  key={extension.id}
                >
                  <div className="flex min-w-0 gap-3">
                    <ThemeExtensionIcon key={extension.iconUrl} extension={extension} />
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-medium">{extension.name}</h4>
                      <p className="truncate text-muted-foreground text-xs">
                        {extension.publisher} ·{" "}
                        {t("appearance.theme.search.downloads", {
                          count: DOWNLOAD_FORMAT.format(extension.downloadCount),
                        })}
                      </p>
                    </div>
                  </div>
                  <p className="line-clamp-2 min-h-8 text-muted-foreground text-xs leading-4">
                    {extension.description || t("appearance.theme.search.fallbackDescription")}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-muted-foreground text-[11px]">
                        <ShieldCheckIcon className="size-3" /> {extension.license}
                      </span>
                      {extension.sourceUrl ? (
                        <a
                          aria-label={`View source for ${extension.name}`}
                          className="inline-flex items-center gap-1 text-muted-foreground text-[11px] hover:text-foreground"
                          href={extension.sourceUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {t("appearance.theme.search.source")}{" "}
                          <ExternalLinkIcon className="size-3" />
                        </a>
                      ) : null}
                    </div>
                    <Button
                      aria-label={`${isInstalling ? progressAction : action} ${extension.name}`}
                      disabled={installingId !== null}
                      size="xs"
                      variant="outline"
                      onClick={() => void handleInstall(extension, false)}
                    >
                      {isInstalling ? <Spinner /> : isInstalled ? <RefreshCwIcon /> : <PlusIcon />}
                      {isInstalling ? `${progressAction}...` : action}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : null}

      <AlertDialog
        open={pendingUpdate !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingUpdate(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("appearance.theme.search.updateTitle", { theme: pendingUpdate?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("appearance.theme.search.updateDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              {t("appearance.theme.cancel")}
            </AlertDialogClose>
            <Button
              onClick={() => {
                const extension = pendingUpdate;
                setPendingUpdate(null);
                if (extension) void handleInstall(extension, true);
              }}
            >
              {t("appearance.theme.search.updateAction")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </section>
  );
}
