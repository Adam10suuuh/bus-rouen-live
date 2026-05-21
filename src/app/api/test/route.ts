import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    message: "Bus Rouen Live API test",
  });
}
