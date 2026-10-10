export const DOCUMENT_TYPES = [
  { value: "CONTRACT", label: "Contract" },
  { value: "NDA", label: "NDA" },
  { value: "SOW", label: "SOW" },
  { value: "PROPOSAL", label: "Proposal" },
  { value: "REPORT", label: "Report" },
  { value: "REFERENCE", label: "Reference" },
  { value: "W9", label: "W-9" },
  { value: "FORM_1099", label: "1099" },
  { value: "OTHER", label: "Other" },
] as const;

export const DOCUMENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_TYPES.map((t) => [t.value, t.label])
);
