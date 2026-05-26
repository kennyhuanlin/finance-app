import { NextRequest, NextResponse } from "next/server";

function getGoogleScriptUrl() {
  const url = process.env.GOOGLE_SCRIPT_URL;

  if (!url) {
    throw new Error("GOOGLE_SCRIPT_URL is not configured");
  }

  return url;
}

function proxyResponse(body: string, status: number) {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const sheet = request.nextUrl.searchParams.get("sheet");

    if (!sheet) {
      return NextResponse.json(
        { error: "Missing sheet parameter" },
        { status: 400 },
      );
    }

    const url = getGoogleScriptUrl();
    const response = await fetch(`${url}?sheet=${encodeURIComponent(sheet)}`, {
      method: "GET",
      cache: "no-store",
    });
    const body = await response.text();

    return proxyResponse(body, response.status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch sheet" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const url = getGoogleScriptUrl();
    const body = await request.json();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const responseBody = await response.text();

    return proxyResponse(responseBody, response.status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to mutate sheet" },
      { status: 500 },
    );
  }
}
