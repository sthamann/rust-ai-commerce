/** Icon: Presentational icons and catalogue artwork with explicit inputs.. */
export type IconName =
  | "chat"
  | "pulse"
  | "graph"
  | "agents"
  | "arrow"
  | "send"
  | "plus"
  | "settings"
  | "check"
  | "close"
  | "refresh"
  | "moon"
  | "sun"
  | "lock"
  | "link"
  | "box"
  | "search"
  | "copy"
  | "menu"
  | "spark"
  | "building"
  | "globe"
  | "truck"
  | "card"
  | "percent"
  | "people"
  | "code"
  | "layers";
const paths: Record<IconName, string> = {
  building: "M4 21h16M6 21V3h12v18M9 7h1M14 7h1M9 11h1M14 11h1M10 21v-5h4v5",
  globe:
    "M3 12h18M12 3c-6 6-6 12 0 18M12 3c6 6 6 12 0 18M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0",
  truck:
    "M2 5h12v12H2ZM14 9h4l4 5v3h-8M4 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0M16 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0",
  card: "M3 5h18v14H3ZM3 10h18M7 15h3",
  percent:
    "M5 19 19 5M4 6a2 2 0 1 0 4 0 2 2 0 1 0-4 0M16 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0",
  people:
    "M4 21v-3a5 5 0 0 1 10 0v3M5 6a4 4 0 1 0 8 0 4 4 0 1 0-8 0M17 3a4 4 0 0 1 0 8M18 14a5 5 0 0 1 3 5v2",
  code: "m8 5-6 7 6 7M16 5l6 7-6 7M14 3l-4 18",
  layers: "m3 7 9-4 9 4-9 4-9-4ZM3 12l9 4 9-4M3 17l9 4 9-4",

  chat: "M21 11a8 8 0 0 1-8 8H7l-5 3V11a8 8 0 0 1 8-8h3a8 8 0 0 1 8 8Z",
  pulse: "M3 12h4l3-8 4 16 3-8h4",
  graph:
    "M6 6l12 2M6 6l4 13M18 8l-8 11M3 6a3 3 0 1 0 6 0 3 3 0 1 0-6 0M15 8a3 3 0 1 0 6 0 3 3 0 1 0-6 0M7 19a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  agents: "M9 3v3M15 3v3M5 7h14v13H5ZM2 11h3M19 11h3M8 11h1M15 11h1M9 16h6",
  arrow: "M5 12h14M13 6l6 6-6 6",
  send: "m3 3 18 9-18 9 4-9-4-9ZM7 12h14",
  plus: "M12 5v14M5 12h14",
  settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M18 6 6 18",
  refresh:
    "M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 14-2l1 6M4 12l1 6a8 8 0 0 0 14-2",
  moon: "M20 15A8 8 0 0 1 9 4a9 9 0 1 0 11 11Z",
  sun: "M12 3v2M12 19v2M3 12h2M19 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2M8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5ZM12 15v2",
  link: "m9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  box: "m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 1 0 0-14M15 15l6 6",
  copy: "M8 8h12v13H8ZM4 16H2V2h13v3",
  menu: "M4 6h16M4 12h16M4 18h16",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z",
};
export default function Icon({
  name,
  size = 20,
}: {
  name: IconName;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
