"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MONTHLY_PRICE_USD, YEARLY_PRICE_USD, YEARLY_DISCOUNT_PERCENT } from "@/lib/pricing";

const FREE_FEATURES = ["Up to 2 clients", "1 user", "Time tracking & invoicing", "PDF invoices"];

const PAID_FEATURES = [
  "Unlimited clients & projects",
  "Unlimited team members",
  "Rate overrides & team time view",
  "Milestones & QuickBooks push",
  "Linear sync for tasks",
  "REST API & MCP access",
];

export function PricingSection({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const isYearly = interval === "yearly";
  const monthlyEquivalent = YEARLY_PRICE_USD / 12;

  return (
    <section id="pricing" className="mx-auto w-full max-w-6xl px-6 py-20">
      <div className="mb-8 max-w-xl">
        <h2 className="text-3xl font-semibold tracking-tight">
          One plan. One price. No seat math.
        </h2>
        <p className="mt-3 text-muted-foreground">
          Start free, upgrade when you outgrow it — not before.
        </p>
      </div>

      <div className="mb-8 inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 text-sm">
        <button
          type="button"
          onClick={() => setInterval("monthly")}
          className={cn(
            "rounded-full px-4 py-1.5 font-medium transition-colors",
            !isYearly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setInterval("yearly")}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-1.5 font-medium transition-colors",
            isYearly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Yearly
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-xs",
              isYearly ? "bg-primary-foreground/20" : "bg-chart-3/15 text-chart-3"
            )}
          >
            Save {YEARLY_DISCOUNT_PERCENT}%
          </span>
        </button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:mx-auto lg:max-w-3xl">
        <Card className="gap-6 p-8">
          <div>
            <h3 className="font-medium">Free</h3>
            <p className="mt-2 text-3xl font-semibold tabular-figures">$0</p>
            <p className="text-sm text-muted-foreground">forever</p>
          </div>
          <ul className="flex flex-1 flex-col gap-2.5 text-sm">
            {FREE_FEATURES.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-muted-foreground" />
                {item}
              </li>
            ))}
          </ul>
          <Button variant="outline" asChild>
            <Link href={isAuthenticated ? "/dashboard" : "/signup"}>
              {isAuthenticated ? "Go to dashboard" : "Start free"}
            </Link>
          </Button>
        </Card>

        <Card className="gap-6 border-primary/40 p-8">
          <div>
            <h3 className="font-medium">Consultainer</h3>
            <p className="mt-2 text-3xl font-semibold tabular-figures">
              ${isYearly ? monthlyEquivalent.toFixed(2) : MONTHLY_PRICE_USD.toFixed(2)}
              <span className="text-base font-normal text-muted-foreground">/mo</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {isYearly
                ? `billed ${YEARLY_PRICE_USD.toFixed(2)}/yr, flat per organization`
                : `flat, per organization — or ${YEARLY_PRICE_USD.toFixed(2)}/yr, save ${YEARLY_DISCOUNT_PERCENT}%`}
            </p>
          </div>
          <ul className="flex flex-1 flex-col gap-2.5 text-sm">
            {PAID_FEATURES.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
          <Button asChild>
            <Link href={isAuthenticated ? "/dashboard" : "/signup"}>
              {isAuthenticated ? "Go to dashboard" : "Start free"}
            </Link>
          </Button>
        </Card>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Have a discount code? You can apply it at checkout after starting a subscription.
      </p>
    </section>
  );
}
