// Library URL state, shared by the server page and the client browser.
export type LibraryState = {
  q: string;
  topic: string;
  kind: string;
  status: string;
  stack: string;
  has: string;
  year: string;
  tag: string;
  sort: string;
  view: string;
  hidden: string;
};

export const LIBRARY_KEYS: (keyof LibraryState)[] = [
  "q", "topic", "kind", "status", "stack", "has", "year", "tag", "sort", "view", "hidden",
];
