import { redirect } from "next/navigation";

/** The middleware routes signed-in users to their area; everyone else goes to login. */
export default function Home() {
  redirect("/login");
}
