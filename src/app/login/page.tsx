import { redirect } from "next/navigation";

// Single-user mode: no login screen.
export default function LoginPage() {
  redirect("/trips");
}
