import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ service: "paychad-web", status: "ok" });
}
