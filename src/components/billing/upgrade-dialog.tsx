"use client";

import { useTranslations } from "next-intl";
import { Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Shown when an action would pass a plan limit (contacts, AI replies, seats, booking staff). */
export function UpgradeDialog({
  open,
  onOpenChange,
  limitKey,
  onUpgrade,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  limitKey: "seats" | "contacts" | "aiReplies" | "bookingStaff";
  onUpgrade: () => void;
}) {
  const t = useTranslations("Billing");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <span className="mb-2 flex size-11 items-center justify-center rounded-xl bg-[var(--tone-butter)] text-[#7A5A0E] dark:text-amber-300">
            <Zap className="size-5" />
          </span>
          <DialogTitle>{t("limitTitle")}</DialogTitle>
          <DialogDescription>{t("limitDesc", { limit: t(`usage_${limitKey}`).toLowerCase() })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("notNow")}
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onUpgrade();
            }}
          >
            {t("upgrade")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
