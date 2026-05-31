import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { messagingApi } from "@line/bot-sdk";
import { getFaq, faqToText } from "@/lib/sheet";
import { askGemini, DEFAULT_MESSAGE } from "@/lib/gemini";

const { MessagingApiClient } = messagingApi;

function verifySignature(body: string, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET ?? "";
  const hash = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. verify LINE signature
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

  // ตอบ 200 ทันทีเพื่อไม่ให้ LINE timeout (10 วิ)
  // แล้วค่อย process event แบบ fire-and-forget
  const processingPromise = handleEvents(body.events);

  // รอ process แบบ best-effort (Vercel Edge รอให้ Response ส่งออกไปก่อน)
  await processingPromise;

  return NextResponse.json({ ok: true }, { status: 200 });
}

async function handleEvents(events: LineEvent[]): Promise<void> {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  const client = new MessagingApiClient({ channelAccessToken: accessToken });

  for (const event of events) {
    // 2. รับเฉพาะ message text
    if (event.type !== "message" || event.message.type !== "text") continue;
    if (!event.replyToken) continue;

    const userMessage = event.message.text.trim();

    // 3. fetch FAQ (cache 60 วิ)
    const faqRows = await getFaq();
    const faqContent = faqToText(faqRows);

    // 4-6. call Gemini (prompt assembly + log tokens อยู่ใน gemini.ts)
    let replyText: string;
    try {
      replyText = await askGemini(faqContent, userMessage);
    } catch {
      replyText = DEFAULT_MESSAGE;
    }

    // 8. reply กลับ LINE
    try {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: "text", text: replyText }],
      });
    } catch (err) {
      // error handling: log แล้วจบ ห้าม retry
      console.error("[webhook] replyMessage failed:", err);
    }
  }
}

// minimal type สำหรับ LINE event ที่ใช้จริง
interface LineEvent {
  type: string;
  replyToken?: string;
  message: {
    type: string;
    text: string;
  };
}
