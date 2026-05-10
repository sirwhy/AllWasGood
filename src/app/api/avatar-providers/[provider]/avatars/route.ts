/**
 * Best-effort proxy to fetch the user's available avatars from their chosen
 * provider, so the new-avatar form can show a picker instead of asking the
 * user to paste raw avatar IDs. Returns 200 with [] on missing-credential or
 * upstream errors so the UI can fall back gracefully.
 */
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { resolveCredentials } from "@/lib/credentials";

interface AvatarPickerEntry {
  id: string;
  name?: string;
  preview?: string;
  gender?: string;
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
    let list: AvatarPickerEntry[] = [];
    if (provider === "heygen") {
      const r = await fetch("https://api.heygen.com/v2/avatars", {
        headers: { "X-Api-Key": creds.apiKey },
        cache: "no-store",
      });
      if (!r.ok) return NextResponse.json([], { status: 200 });
      const j = (await r.json()) as {
        data?: { avatars?: { avatar_id: string; avatar_name?: string; preview_image_url?: string; gender?: string }[] };
      };
      list = (j.data?.avatars ?? []).slice(0, 200).map((a) => ({
        id: a.avatar_id,
        name: a.avatar_name,
        preview: a.preview_image_url,
        gender: a.gender,
      }));
    }
    return NextResponse.json(list);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
