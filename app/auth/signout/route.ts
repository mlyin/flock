import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** POST-only: a GET would let any image tag or link log the user out. */
export async function POST(request: NextRequest) {
  await (await supabaseServer()).auth.signOut();
  return NextResponse.redirect(new URL("/login", new URL(request.url).origin), { status: 303 });
}
