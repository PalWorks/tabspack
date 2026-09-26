/**
 * The session every store screenshot shows.
 *
 * One believable person: a graduate student with a thesis, a trip and a job,
 * which is the shape of a real crowded browser. The addresses are real public
 * pages so the screenshots read as real, but nothing is ever fetched from them:
 * `scripts/gen-store-art.mjs` answers every request itself with a page carrying
 * the title below, so a capture run never touches the internet.
 *
 * `days` is how long ago each tab was last opened. A browser sets that value
 * itself and no API can, so the capture run stages it: the export pane is the
 * real page running the real code, fed these timestamps instead of the ones a
 * browser opened seconds ago would report. That is ordinary demo data, and it
 * is written down here so nobody mistakes it for a measurement.
 */
export const DEMO_WINDOWS = [
  {
    name: "Thesis",
    focused: true,
    tabs: [
      { url: "https://www.zotero.org/mylibrary", title: "My Library · Zotero", pinned: true, days: 0 },
      { url: "https://github.com/notifications", title: "Notifications · GitHub", pinned: true, days: 0 },
      { url: "https://arxiv.org/abs/1706.03762", title: "Attention Is All You Need", group: "Reading", days: 0, active: true },
      { url: "https://arxiv.org/abs/2001.08361", title: "Scaling Laws for Neural Language Models", group: "Reading", days: 2 },
      { url: "https://arxiv.org/abs/2201.11903", title: "Chain-of-Thought Prompting Elicits Reasoning", group: "Reading", days: 3 },
      { url: "https://arxiv.org/abs/2106.09685", title: "LoRA: Low-Rank Adaptation of Large Language Models", group: "Reading", days: 9 },
      { url: "https://arxiv.org/abs/2005.14165", title: "Language Models are Few-Shot Learners", group: "Reading", days: 41 },
      { url: "https://scikit-learn.org/stable/modules/cross_validation.html", title: "Cross-validation: evaluating estimator performance", group: "Methods", days: 1 },
      { url: "https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.groupby.html", title: "pandas.DataFrame.groupby", group: "Methods", days: 6 },
      { url: "https://matplotlib.org/stable/users/explain/customizing.html", title: "Customizing Matplotlib with style sheets", group: "Methods", days: 118 },
      { url: "https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)", title: "Transformer (deep learning architecture) - Wikipedia", days: 0 },
      { url: "https://stackoverflow.com/questions/tagged/git-rebase", title: "Newest 'git-rebase' Questions - Stack Overflow", days: 17 },
      { url: "https://docs.python.org/3/library/pathlib.html", title: "pathlib — Object-oriented filesystem paths", days: 203 },
      { url: "https://www.overleaf.com/learn/latex/Bibliography_management_with_biblatex", title: "Bibliography management with biblatex", days: 64 },
    ],
  },
  {
    name: "Lisbon",
    tabs: [
      { url: "https://en.wikipedia.org/wiki/Lisbon", title: "Lisbon - Wikipedia", group: "Trip", days: 12 },
      { url: "https://en.wikipedia.org/wiki/Bel%C3%A9m_Tower", title: "Belém Tower - Wikipedia", group: "Trip", days: 12 },
      { url: "https://www.openstreetmap.org/search?query=Alfama%20Lisbon", title: "Alfama, Lisbon · OpenStreetMap", group: "Trip", days: 13 },
      { url: "https://www.visitlisboa.com/en", title: "Visit Lisboa · Official tourism site", group: "Trip", days: 13 },
      { url: "https://www.metrolisboa.pt/en/travel/diagrams-and-maps/", title: "Metro network map · Metropolitano de Lisboa", group: "Trip", days: 30 },
      { url: "https://www.ipma.pt/en/otempo/prev.localidade.hora/", title: "Lisbon forecast · IPMA", days: 95 },
      { url: "https://en.wikipedia.org/wiki/Sintra", title: "Sintra - Wikipedia", days: 140 },
    ],
  },
  {
    name: "Work",
    tabs: [
      { url: "https://github.com/PalWorks/tabspack/projects", title: "Roadmap · Projects · GitHub", group: "Q4 planning", days: 1 },
      { url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch", title: "Using the Fetch API - MDN Web Docs", group: "Q4 planning", days: 4 },
      { url: "https://www.rfc-editor.org/rfc/rfc9110.html", title: "RFC 9110: HTTP Semantics", group: "Q4 planning", days: 22 },
      { url: "https://web.dev/articles/vitals", title: "Web Vitals · web.dev", group: "Q4 planning", days: 57 },
      { url: "https://developer.chrome.com/docs/extensions/reference/api/tabGroups", title: "chrome.tabGroups · Chrome for Developers", days: 2 },
      { url: "https://www.w3.org/TR/WCAG22/", title: "Web Content Accessibility Guidelines (WCAG) 2.2", days: 180 },
      { url: "https://news.ycombinator.com/", title: "Hacker News", days: 250 },
    ],
  },
];

/** Chrome's own group colours, which is what the preview draws. */
export const DEMO_GROUPS = {
  Reading: { color: "green", collapsed: false },
  Methods: { color: "blue", collapsed: false },
  Trip: { color: "orange", collapsed: true },
  "Q4 planning": { color: "purple", collapsed: false },
};

const DAY = 86_400_000;

/** Every demo tab keyed by address, for the page server and the age staging. */
export function demoIndex() {
  const index = new Map();
  for (const win of DEMO_WINDOWS) for (const tab of win.tabs) index.set(tab.url, tab);
  return index;
}

/**
 * The same session as a TabsPack file, written to docs/SPEC.md by hand rather
 * than exported, so the import screenshots do not depend on the export path.
 */
export function demoPack(now = Date.now()) {
  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "+00:00");
  let groupSeq = 0;
  const windows = DEMO_WINDOWS.map((win, w) => {
    const groups = [];
    const ids = new Map();
    for (const tab of win.tabs) {
      if (tab.group && !ids.has(tab.group)) {
        groupSeq += 1;
        const id = `g${groupSeq}`;
        ids.set(tab.group, id);
        groups.push({ id, title: tab.group, color: DEMO_GROUPS[tab.group].color, collapsed: DEMO_GROUPS[tab.group].collapsed });
      }
    }
    return {
      id: `w${w + 1}`,
      state: "normal",
      focused: Boolean(win.focused),
      groups,
      tabs: win.tabs.map((tab, index) => ({
        index,
        url: tab.url,
        title: tab.title,
        ...(tab.pinned ? { pinned: true } : {}),
        ...(tab.active ? { active: true } : {}),
        ...(tab.group ? { groupId: ids.get(tab.group) } : {}),
        lastAccessed: iso(now - tab.days * DAY),
      })),
    };
  });
  return { format: "tabspack", schemaVersion: 1, exportedAt: iso(now), windows };
}
