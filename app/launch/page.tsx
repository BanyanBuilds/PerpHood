import { redirect } from "next/navigation";

export default function LaunchRedirect() {
  redirect("/terminal?panel=launch");
}
