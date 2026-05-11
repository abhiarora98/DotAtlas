export type NavItem = {
  label: string;
  href: string;
  badge?: string;
};

export type NavGroup = {
  group: "Operate" | "Sense" | "Studio";
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    group: "Operate",
    items: [
      { label: "Today", href: "/" },
      { label: "Orders", href: "/orders" },
      { label: "Parties", href: "/parties" },
      { label: "Inventory", href: "/inventory" },
      { label: "Dispatch", href: "/dispatch" },
      { label: "Create PI", href: "/pi/new", badge: "new" },
    ],
  },
  {
    group: "Sense",
    items: [
      { label: "Cash", href: "/cash" },
      { label: "Receivables", href: "/receivables" },
      { label: "Intelligence", href: "/intelligence" },
      { label: "Reports", href: "/reports" },
    ],
  },
  {
    group: "Studio",
    items: [
      { label: "Workflows", href: "/workflows" },
      { label: "Settings", href: "/settings" },
    ],
  },
];
