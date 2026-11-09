import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function NotFound() {
  return (
    <main className="container max-w-md py-16">
      <EmptyState title="ไม่พบทริป หรือคุณไม่มีสิทธิ์เข้าถึง" body="Trip not found or you are not a member."
        action={<Button asChild variant="outline"><Link href="/trips">ทริปของฉัน</Link></Button>} />
    </main>
  );
}
