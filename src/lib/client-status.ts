// Draft clients (status LEAD) come from Cal.com/Calendly bookings. They can
// get estimates, but no projects, invoices, retainers, billing cycles or
// share links until an owner or admin makes them a client.

export const DRAFT_CLIENT_ERROR = "This is a draft client. Make it a client first (Make client, on its page).";

export const isDraftClient = (client: { status: string } | null | undefined) => client?.status === "LEAD";
