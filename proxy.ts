import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAccess } from "./app/lib/apiAccess";
export function proxy(request: NextRequest) {
  return requireFinanceAccess(request) ?? NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|woff2)$).*)"] };
