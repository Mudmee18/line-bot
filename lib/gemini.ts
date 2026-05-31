import { GoogleGenAI } from "@google/genai";

const DEFAULT_MESSAGE =
  "ขออภัยค่ะ ขอให้เจ้าหน้าที่ติดต่อกลับนะคะ 🙏\nรบกวนขอชื่อและเบอร์โทรติดต่อของคุณลูกค้าด้วยนะคะ\nหรือสอบถามเพิ่มเติมได้ที่ Line: @greenproksp หรือโทร 094-864-9799 ค่ะ";

const SYSTEM_PROMPT_TEMPLATE = `<role>
  คุณคือ Admin ของบริษัท Green Pro KSP ผู้ให้บริการ
  จดทะเบียนจัดตั้งบริษัท จดทะเบียนเปลี่ยนแปลง ขอใบอนุญาตประกอบธุรกิจ
  งานบัญชี ตรวจสอบบัญชี และที่ปรึกษาครบวงจร
</role>

<constraints>
  - ตอบโดยใช้ข้อมูลใน <faq> เท่านั้น
  - ห้ามแต่งราคา เวลา หรือขั้นตอนที่ไม่มีใน FAQ
  - ถ้าไม่มีข้อมูลให้ตอบ default_message ทันที ห้ามเดา
  - โทน: สุภาพ มีระยะห่างเล็กน้อย ใช้ "ค่ะ" ลงท้าย
  - emoji ได้ไม่เกิน 1-2 ตัวต่อข้อความ
  - ความยาว 1-3 ประโยคเท่านั้น ห้ามยาวกว่านี้
</constraints>

<output_format>
  - ภาษาไทยเท่านั้น
  - ห้ามใช้ markdown เช่น ** หรือ ##
  - ห้ามขึ้นหัวข้อหรือใส่ bullet point
</output_format>

<default_message>
  ขออภัยค่ะ ขอให้เจ้าหน้าที่ติดต่อกลับนะคะ 🙏
  รบกวนขอชื่อและเบอร์โทรติดต่อของคุณลูกค้าด้วยนะคะ
  หรือสอบถามเพิ่มเติมได้ที่ Line: @greenproksp หรือโทร 094-864-9799 ค่ะ
</default_message>

<faq>
{{FAQ_CSV_CONTENT}}
</faq>

<question>
{{USER_MESSAGE}}
</question>`;

export async function askGemini(
  faqContent: string,
  userMessage: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[gemini] GEMINI_API_KEY is not set");
    return DEFAULT_MESSAGE;
  }

  const prompt = SYSTEM_PROMPT_TEMPLATE.replace(
    "{{FAQ_CSV_CONTENT}}",
    faqContent
  ).replace("{{USER_MESSAGE}}", userMessage);

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 1.0,
        maxOutputTokens: 1024,
      },
    });

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const thoughtsTokens = response.usageMetadata?.thoughtsTokenCount ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

    console.log(
      `[gemini] finishReason=${finishReason} thoughtsTokens=${thoughtsTokens} outputTokens=${outputTokens}`
    );

    if (finishReason === "MAX_TOKENS") {
      console.warn("[gemini] MAX_TOKENS reached → returning default_message");
      return DEFAULT_MESSAGE;
    }

    return candidate?.content?.parts?.[0]?.text?.trim() ?? DEFAULT_MESSAGE;
  } catch (err) {
    console.error("[gemini] error:", err);
    return DEFAULT_MESSAGE;
  }
}

export { DEFAULT_MESSAGE };
