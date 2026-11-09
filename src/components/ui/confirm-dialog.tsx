"use client";
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "./button";
import { Input } from "./input";

export function ConfirmDialog({
  trigger, title, body, confirmLabel, cancelLabel, destructive, requireText, onConfirm,
}: {
  trigger: React.ReactNode; title: string; body?: string; confirmLabel: string; cancelLabel: string;
  destructive?: boolean; requireText?: string; onConfirm: () => Promise<void> | void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const blocked = requireText !== undefined && typed.trim() !== requireText.trim();
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); setTyped(""); }}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          {body && <Dialog.Description className="mt-2 text-sm text-muted-foreground">{body}</Dialog.Description>}
          {requireText !== undefined && (
            <Input className="mt-4" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={requireText} aria-label={requireText} />
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild><Button variant="outline">{cancelLabel}</Button></Dialog.Close>
            <Button
              variant={destructive ? "destructive" : "default"}
              disabled={busy || blocked}
              onClick={async () => {
                setBusy(true);
                try { await onConfirm(); setOpen(false); } finally { setBusy(false); }
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
