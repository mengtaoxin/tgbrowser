export type SiteKind = "sanity" | "common" | "signal";

export interface BenchSite {
  id: string;
  url: string;
  kind: SiteKind;
  /** Substring expected in document title when loaded (case-insensitive). */
  titleIncludes?: string;
}

/** Core reachability set — small on purpose; expand later. */
export const CORE_SITES: readonly BenchSite[] = [
  {
    id: "example",
    url: "https://example.com/",
    kind: "sanity",
    titleIncludes: "example domain",
  },
  {
    id: "wikipedia",
    url: "https://www.wikipedia.org/",
    kind: "common",
    titleIncludes: "wikipedia",
  },
  {
    id: "baidu",
    url: "https://www.baidu.com/",
    kind: "common",
    titleIncludes: "百度",
  },
  {
    id: "sannysoft",
    url: "https://bot.sannysoft.com/",
    kind: "signal",
  },
];
