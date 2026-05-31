import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { messagingApi } from "@line/bot-sdk";
import { getFaq, faqToText } from "@/lib/sheet";
import { askGemini, DEFAULT_MESSAGE } from "@/lib/gemini";

const { MessagingApiClient } = messagingApi;

function verifySignature(body: string, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET ?? "";
  const hash = crypto.createHmac("sha256", secret).update(body).digest("base64");
  return hash === signature;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get("x-line-signature") ?? "";
  const rawBody = await req.text();

  if (!verifySignature(rawBody, signature)) {
    console.warn("[webhook] invalid signature");
    return NextResponse.json({ error: "Forbidden" }, { status: 400 });
  }

  let body: { events: LineEvent[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad Request" }, { status: 400 });
  }

  console.log("[webhook] events received:", body.events.length);
  await handleEvents(body.events);
  return NextResponse.json({ ok: true }, { status: 200 });
}

async function handleEvents(events: LineEvent[]): Promise<void> {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  const client = new MessagingApiClient({ channelAccessToken: accessToken });

  for (const event of events) {
    console.log("[webhook] event type:", event.type);

    if (event.type !== "message") continue;
    if (!event.message || event.message.type !== "text") continue;
    if (!event.replyToken) {
      console.warn("[webhook] no replyToken, skip");
      continue;
    }

    const userMessage = event.message.text.trim();
    console.log("[webhook] userMessage:", userMessage);

    const faqRows = await getFaq();
    const faqContent = faqToText(faqRows);
    console.log("[webhook] faq rows:", faqRows.length);

    let replyText: string;
    try {
      replyText = await askGemini(faqContent, userMessage);
    } catch {
      replyText = DEFAULT_MESSAGE;
    }

    console.log("[webhook] replyText preview:", replyText.substring(0, 50));

    try {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: "text", text: replyText }],
      });
      console.log("[webhook] reply sent OK");
    } catch (err) {
      console.error("[webhook] replyMessage failed:", err);
    }
  }
}

interface LineEvent {
  type: string;
  replyToken?: string;
  message: {
    type: string;
    text: string;
  };
}