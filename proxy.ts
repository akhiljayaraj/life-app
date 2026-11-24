import { NextResponse, type NextRequest } from "next/server";
import { isLocalHost } from "@/lib/guard";

// Runs for every request: a rebinding page must not reach the dashboard or its actions.
export function proxy(request: NextRequest) {
  if (!isLocalHost(request.headers.get("host"))) {
    return new NextResponse("forbidden", { status: 403 });
  }
  return NextResponse.next();
}
