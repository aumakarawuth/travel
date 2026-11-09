"use client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="container max-w-md py-16">
      <EmptyState title="เกิดข้อผิดพลาด" body="Something went wrong." action={<Button onClick={reset}>ลองใหม่</Button>} />
    </main>
  );
}
