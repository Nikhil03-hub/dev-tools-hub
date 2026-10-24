// Static (non-tool) page DATA, used by the app and by the static-page
// generator. Pure: no imports except types. Wording rules: UX_SPEC.md §8.

export type StaticPageId = "home" | "privacy" | "about" | "notfound";

export interface StaticPage {
  id: StaticPageId;
  /** URL path, with leading and trailing slash ("/" for home); notfound is written to /404.html. */
  path: string;
  /** Full <title>. */
  title: string;
  /** Meta description, 70–155 chars. */
  description: string;
  /** H1 shown in the prerendered HTML and in the app. */
  heading: string;
  /** Paragraphs of plain text (no HTML). */
  body: string[];
}

export const SITE_NAME = "Dev Tools Hub";

/** The one sentence we use everywhere to describe the privacy guarantee (ARCHITECTURE.md §6.2). */
export const PRIVACY_PROMISE =
  "After the page loads, the only requests are for this site's own code files. No request ever carries what you paste. The browser blocks connections to any server (connect-src 'none').";

export const STATIC_PAGES: StaticPage[] = [
  {
    id: "home",
    path: "/",
    title: "Dev Tools Hub: private developer tools that run in your browser",
    description:
      "Format, convert, decode and debug without uploading anything. JSON, JWT, regex, timestamps, encoders and a Debug Report that redacts secrets.",
    heading: "Developer tools that never see your data.",
    body: [
      "Format, convert, decode and debug. Everything runs in your browser.",
      "Paste a failing request or log and get a redacted report you can safely share.",
    ],
  },
  {
    id: "privacy",
    path: "/privacy/",
    title: "Privacy and how to verify it · Dev Tools Hub",
    description:
      "How Dev Tools Hub keeps what you paste on your device, the exact Content-Security-Policy, and how to check it yourself in DevTools.",
    heading: "Privacy, and how to check it yourself",
    body: [
      "Every tool runs in your browser. There is no backend that receives what you paste, and there are no accounts.",
      PRIVACY_PROMISE,
      "To check: open your browser's DevTools, go to the Network tab, then paste something into any tool. You will only see files from this site's /assets/ folder.",
      "If anonymous usage counters are enabled, they are 1×1 image requests to GoatCounter carrying a fixed event name such as debug-analyze. They never carry your input.",
      "Redaction in Debug Report covers known secret formats and fields named like secrets. It can miss unusual secrets, so review a report before you share it.",
      "The full source code is on GitHub under the MIT licence.",
    ],
  },
  {
    id: "about",
    path: "/about/",
    title: "About · Dev Tools Hub",
    description:
      "Dev Tools Hub is an open-source set of privacy-first developer tools by Nikhil, built to run entirely in the browser.",
    heading: "About Dev Tools Hub",
    body: [
      "Dev Tools Hub is a free, open-source set of developer tools that run entirely in your browser.",
      "It is built around one idea: you should be able to debug and share technical problems without leaking tokens, cookies or personal data.",
      "Keyboard shortcuts: Ctrl K or ⌘K opens the command palette; / also opens it outside text fields; [ collapses the sidebar.",
    ],
  },
  {
    id: "notfound",
    path: "/404.html",
    title: "Page not found · Dev Tools Hub",
    description: "This page does not exist. Search the tools or go back to the Dev Tools Hub home page to find what you need.",
    heading: "Page not found",
    body: ["This page does not exist. Use search or go back to the home page."],
  },
];
