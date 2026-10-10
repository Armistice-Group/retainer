// Import field names and labels, shared by the server and the import page
// (no Node-only imports here).

export const IMPORT_SOURCES = ["harvest", "toggl", "clockify", "generic"] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const IMPORT_KINDS = ["time", "projects", "clients"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const SOURCE_LABELS: Record<ImportSource, string> = {
  harvest: "Harvest",
  toggl: "Toggl Track",
  clockify: "Clockify",
  generic: "Other CSV",
};

export const KIND_LABELS: Record<ImportKind, string> = {
  time: "Time entries",
  projects: "Projects",
  clients: "Clients",
};

export const MAX_IMPORT_ROWS = 50_000;
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export const IMPORT_FIELDS = [
  "date",
  "hours",
  "duration",
  "startTime",
  "endTime",
  "client",
  "project",
  "task",
  "notes",
  "billable",
  "invoiced",
  "rate",
  "amount",
  "person",
  "firstName",
  "lastName",
  "email",
  "currency",
  "address",
  "phone",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABELS: Record<ImportField, string> = {
  date: "Date",
  hours: "Hours (decimal)",
  duration: "Duration (h:mm or h:mm:ss)",
  startTime: "Start time",
  endTime: "End time",
  client: "Client",
  project: "Project",
  task: "Task",
  notes: "Notes / description",
  billable: "Billable (yes/no)",
  invoiced: "Already invoiced (yes/no)",
  rate: "Hourly rate",
  amount: "Billable amount",
  person: "Person (full name)",
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  currency: "Currency",
  address: "Address",
  phone: "Phone",
};

/** Which fields the mapping step offers for each kind of file. */
export const KIND_FIELDS: Record<ImportKind, ImportField[]> = {
  time: [
    "date",
    "hours",
    "duration",
    "startTime",
    "endTime",
    "client",
    "project",
    "task",
    "notes",
    "billable",
    "invoiced",
    "rate",
    "amount",
    "person",
    "firstName",
    "lastName",
    "email",
    "currency",
  ],
  projects: ["client", "project", "rate", "notes"],
  clients: ["client", "email", "address", "phone"],
};

/** Field → the file's header text (exactly as it appears in the file). */
export type ColumnMapping = Partial<Record<ImportField, string>>;

export const DATE_FORMATS = ["auto", "ymd", "mdy", "dmy"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  auto: "Work it out",
  ymd: "Year-month-day (2026-03-31)",
  mdy: "Month/day/year (03/31/2026)",
  dmy: "Day/month/year (31/03/2026)",
};

