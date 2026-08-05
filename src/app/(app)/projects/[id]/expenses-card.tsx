import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { Receipt, Trash2, Paperclip, Check, X } from "lucide-react";
import { LogExpenseDialog } from "./log-expense-dialog";
import {
  approveExpenseAction,
  rejectExpenseAction,
  deleteExpenseAction,
} from "@/actions/expenses";
import { formatCurrency, formatDate } from "@/lib/format";

export type ExpenseItem = {
  id: string;
  description: string;
  category: string | null;
  amount: number;
  incurredAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submittedByName: string;
  hasReceipt: boolean;
  invoicedAt: string | null;
  canDelete: boolean;
};

function expenseStatus(e: ExpenseItem) {
  if (e.invoicedAt) return "INVOICED";
  return e.status;
}

export function ExpensesCard({
  projectId,
  expenses,
  currency,
  canManage,
}: {
  projectId: string;
  expenses: ExpenseItem[];
  currency: string;
  canManage: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Expenses</CardTitle>
        <LogExpenseDialog projectId={projectId} />
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No expenses logged"
            description="Log reimbursable costs like software or hardware to bill them back to the client."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {expenses.map((e) => {
              const status = expenseStatus(e);
              return (
                <li key={e.id} className="flex items-start justify-between gap-2 py-3">
                  <div className="min-w-0 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{e.description}</span>
                      <StatusBadge status={status} />
                    </div>
                    <p className="mt-0.5 text-muted-foreground">
                      {formatCurrency(e.amount, currency)} · {formatDate(e.incurredAt)}
                      {e.category ? ` · ${e.category}` : ""} · {e.submittedByName}
                    </p>
                    {e.hasReceipt ? (
                      <a
                        href={`/api/expenses/${e.id}/receipt`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 flex items-center gap-1 text-primary hover:underline"
                      >
                        <Paperclip className="size-3.5" /> Receipt
                      </a>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {e.status === "PENDING" && canManage ? (
                      <>
                        <form action={approveExpenseAction.bind(null, e.id, projectId)}>
                          <Button variant="outline" size="sm" type="submit">
                            <Check className="size-3.5" /> Approve
                          </Button>
                        </form>
                        <form action={rejectExpenseAction.bind(null, e.id, projectId)}>
                          <Button variant="outline" size="sm" type="submit">
                            <X className="size-3.5" /> Reject
                          </Button>
                        </form>
                      </>
                    ) : null}
                    {e.canDelete ? (
                      <form action={deleteExpenseAction.bind(null, e.id, projectId)}>
                        <ConfirmSubmitButton
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          confirmMessage={`Delete expense "${e.description}"?`}
                        >
                          <Trash2 className="size-3.5" />
                        </ConfirmSubmitButton>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
