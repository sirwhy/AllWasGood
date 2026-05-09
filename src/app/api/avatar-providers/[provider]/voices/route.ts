import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { resolveCredentials } from "@/lib/credentials";

interface VoiceEntry {
  id: string;
  name?: string;
  language?: string;
  gender?: string;
  preview?: string;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([], { status: 200 });
  const { provider } = await params;

  let creds;
  try {
    creds = await resolveCredentials(session.user.id, provider);
  } catch {
    return NextResponse.json([], { status: 200 });
  }

  try {
    let list: VoiceEntry[] = [];
    if (provider === "heygen") {
      const r = await fetch("https://api.heygen.com/v2/voices", {
        headers: { "X-Api-Key": creds.apiKey },
        cache: "no-store",
      });
      if (!r.ok) return NextResponse.json([], { status: 200 });
      const j = (await r.json()) as {
        data?: { voices?: { voice_id: string; name?: string; language?: string; gender?: string; preview_audio?: string }[] };
      };
      list = (j.data?.voices ?? []).slice(0, 500).map((v) => ({
        id: v.voice_id,
        name: v.name,
        language: v.language,
        gender: v.gender,
        preview: v.preview_audio,
      }));
    } else if (provider === "elevenlabs") {
      const r = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": creds.apiKey },
        cache: "no-store",
      });
      if (!r.ok) return NextResponse.json([], { status: 200 });
      const j = (await r.json()) as {
        voices?: { voice_id: string; name?: string; labels?: { language?: string; gender?: string }; preview_url?: string }[];
      };
      list = (j.voices ?? []).slice(0, 500).map((v) => ({
        id: v.voice_id,
        name: v.name,
        language: v.labels?.language,
        gender: v.labels?.gender,
        preview: v.preview_url,
      }));
    }
    return NextResponse.json(list);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
