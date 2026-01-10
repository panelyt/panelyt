import { notFound } from "next/navigation";

import { UiDemo } from "@/ui/demo";

export default function Page() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <UiDemo />;
}
