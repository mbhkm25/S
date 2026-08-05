from pathlib import Path

path = Path('supabase/functions/sanad-v3-whatsapp-intake/index.ts')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str) -> None:
    global text
    if text.count(old) != 1:
        raise SystemExit(f'expected exactly one match, found {text.count(old)}: {old[:100]!r}')
    text = text.replace(old, new, 1)

replace_once(
'''  caption: string;\n  text: string;\n};''',
'''  caption: string;\n  text: string;\n  interactiveId: string;\n};'''
)

replace_once(
'''    caption: cleanText(media?.caption) || "",\n    text: cleanText(message?.text?.body) || "",\n  };''',
'''    caption: cleanText(media?.caption) || "",\n    text: cleanText(\n      message?.text?.body ||\n      message?.button?.text ||\n      message?.interactive?.button_reply?.title ||\n      message?.interactive?.list_reply?.title,\n    ) || "",\n    interactiveId: cleanText(\n      message?.interactive?.button_reply?.id ||\n      message?.interactive?.list_reply?.id ||\n      message?.button?.payload,\n    ) || "",\n  };'''
)

insert_anchor = '''async function sendUnsupported(to: string): Promise<void> {'''
helper_block = r'''async function sendTextMessage(to: string, body: string): Promise<Record<string, any>> {
  return await graphJson(`/${META_WA_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: true, body },
    }),
  });
}

async function sendGuidanceButtons(params: {
  to: string;
  body: string;
  operationId: string;
  publicToken: string;
  guidanceType: "unmatched" | "analysis_failed";
}): Promise<Record<string, any>> {
  const prefix = params.guidanceType === "unmatched" ? "unmatched" : "analysis_failed";
  return await graphJson(`/${META_WA_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: params.body },
        action: {
          buttons: [
            {
              type: "reply",
              reply: {
                id: `sanad_show_operation:${params.publicToken}`,
                title: "عرض العملية وQR",
              },
            },
            {
              type: "reply",
              reply: {
                id: `sanad_business_intro:${prefix}:${params.operationId}`,
                title: "كيف يستخدم النشاط سند؟",
              },
            },
          ],
        },
      },
    }),
  });
}

function isWithinServiceWindow(timestamp: string): boolean {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return true;
  const ageMs = Date.now() - seconds * 1000;
  return ageMs >= 0 && ageMs <= 24 * 60 * 60 * 1000;
}

async function handleGuidanceAction(message: NormalizedMessage): Promise<boolean> {
  const actionId = message.interactiveId;
  if (!actionId || !message.senderPhone) return false;

  if (actionId.startsWith("sanad_show_operation:")) {
    const token = actionId.slice("sanad_show_operation:".length).trim();
    if (!token) return true;
    const url = `${PUBLIC_APP_BASE_URL}/v/${encodeURIComponent(token)}`;
    await sendTextMessage(
      message.senderPhone,
      `هذه هي العملية التي أرسلتها إلى سند:\n${url}\n\nاعرض رمز QR الموجود داخلها على الكاشير أو الشخص الذي سيتحقق من العملية.`,
    );
    return true;
  }

  if (actionId.startsWith("sanad_business_intro:")) {
    await sendTextMessage(
      message.senderPhone,
      `سند ينظم ما يحدث بعد الدفع الإلكتروني.\n\nعندما يسجل النشاط التجاري حساباته المالية في سند، تصل الإشعارات المطابقة مباشرة إلى وارد المدفوعات الخاص بفريقه، ويمكن للكاشير مراجعتها عبر QR دون استلام هاتف العميل.\n\nتثبيت سند وبدء إعداد النشاط:\nhttps://sanadflow.com/install`,
    );
    return true;
  }

  return false;
}

async function guidanceDeliveryClaim(params: {
  operationId: string;
  guidanceType: "unmatched" | "analysis_failed";
  recipientPhone: string;
  metadata: JsonRecord;
}): Promise<Record<string, any>> {
  return await supabaseJson<Record<string, any>>(
    "/rest/v1/rpc/claim_operation_sender_guidance",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_operation_id: params.operationId,
        p_guidance_type: params.guidanceType,
        p_recipient_phone: params.recipientPhone,
        p_metadata: params.metadata,
      }),
    },
  );
}

async function guidanceDeliveryComplete(params: {
  deliveryId: string;
  status: "sent" | "failed" | "skipped";
  metaMessageId?: string | null;
  error?: string | null;
  metadata?: JsonRecord;
}): Promise<void> {
  await supabaseJson("/rest/v1/rpc/complete_operation_sender_guidance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_delivery_id: params.deliveryId,
      p_status: params.status,
      p_meta_message_id: params.metaMessageId || null,
      p_error: params.error || null,
      p_metadata: params.metadata || {},
    }),
  });
}

async function sendPostAnalysisGuidance(params: {
  operationId: string;
  publicToken: string;
  message: NormalizedMessage;
}): Promise<void> {
  if (!params.message.senderPhone) return;

  const operations = await supabaseJson<Record<string, any>[]>(
    `/rest/v1/operations?select=id,ai_status,ai_error,financial_entity_code,receiver_name,receiver_account_normalized,amount,currency&` +
      `id=eq.${encodeURIComponent(params.operationId)}&limit=1`,
    { method: "GET", headers: { Accept: "application/json" } },
  );
  const operation = operations[0];
  if (!operation) return;

  let guidanceType: "unmatched" | "analysis_failed" | null = null;
  const aiStatus = String(operation.ai_status || "").toLowerCase();
  if (["failed", "error"].includes(aiStatus)) {
    guidanceType = "analysis_failed";
  } else if (aiStatus === "completed") {
    const inboxRows = await supabaseJson<Record<string, any>[]>(
      `/rest/v1/business_payment_inbox?select=id,status&operation_id=eq.${encodeURIComponent(params.operationId)}&limit=1`,
      { method: "GET", headers: { Accept: "application/json" } },
    );
    if (!inboxRows.length) guidanceType = "unmatched";
  }
  if (!guidanceType) return;

  const claim = await guidanceDeliveryClaim({
    operationId: params.operationId,
    guidanceType,
    recipientPhone: params.message.senderPhone,
    metadata: {
      function: FUNCTION_NAME,
      whatsapp_message_id: params.message.messageId,
      ai_status: operation.ai_status || null,
    },
  });
  if (!claim?.claimed || !claim.delivery_id) return;
  const deliveryId = String(claim.delivery_id);

  if (!isWithinServiceWindow(params.message.timestamp)) {
    await guidanceDeliveryComplete({
      deliveryId,
      status: "skipped",
      metadata: { reason: "outside_24h_service_window" },
    });
    return;
  }

  const body = guidanceType === "unmatched"
    ? "تم استلام إشعارك ومعالجته وإنشاء العملية بنجاح ✅\n\nلم نتمكن من ربطها تلقائيًا بنشاط تجاري، لأننا لم نجد حسابًا ماليًا مسجلًا ومطابقًا لبيانات المستفيد داخل سند.\n\nاعرض رمز QR على الكاشير أو صاحب النشاط لفتح العملية ومراجعتها. ويمكنك تعريف النشاط بسند حتى تصل إشعاراته القادمة مباشرة إلى وارد المدفوعات الخاص به."
    : "تم استلام إشعارك وإنشاء العملية ✅\n\nلكن لم نتمكن من قراءة بيانات الإشعار بوضوح، لذلك لم نستطع ربطه تلقائيًا بنشاط تجاري.\n\nيمكنك فتح العملية وعرض رمز QR على الكاشير ليطّلع على الملف الأصلي ويتحقق منه.";

  try {
    const response = await sendGuidanceButtons({
      to: params.message.senderPhone,
      body,
      operationId: params.operationId,
      publicToken: params.publicToken,
      guidanceType,
    });
    const metaMessageId = cleanText(response?.messages?.[0]?.id);
    await guidanceDeliveryComplete({
      deliveryId,
      status: "sent",
      metaMessageId,
      metadata: { interactive: true, button_count: 2 },
    });
    await insertEvent(params.operationId, "whatsapp_sender_guidance_sent", {
      guidance_type: guidanceType,
      recipient_phone: params.message.senderPhone,
      meta_message_id: metaMessageId,
      interactive: true,
    });
  } catch (error) {
    const errorText = truncate(error instanceof Error ? error.message : error);
    await guidanceDeliveryComplete({
      deliveryId,
      status: "failed",
      error: errorText,
    });
    throw error;
  }
}

'''
replace_once(insert_anchor, helper_block + insert_anchor)

replace_once(
'''  const supportedAssistant =\n    message.messageType === "text" ||\n    (message.messageType === "audio" && Boolean(message.mediaId));\n  await registerInbound(message, supportedMedia || supportedAssistant);\n\n  if (supportedAssistant) {\n    await triggerAssistant(message);\n    return;\n  }''',
'''  const supportedAssistant =\n    message.messageType === "text" ||\n    message.messageType === "interactive" ||\n    message.messageType === "button" ||\n    (message.messageType === "audio" && Boolean(message.mediaId));\n  await registerInbound(message, supportedMedia || supportedAssistant);\n\n  if (await handleGuidanceAction(message)) return;\n\n  if (supportedAssistant) {\n    await triggerAssistant(message);\n    return;\n  }'''
)

replace_once(
'''  const results = await Promise.allSettled([analysisPromise, qrPromise]);\n  await recordSpan({''',
'''  const results = await Promise.allSettled([analysisPromise, qrPromise]);\n  try {\n    await sendPostAnalysisGuidance({\n      operationId: operation.id,\n      publicToken,\n      message,\n    });\n  } catch (error) {\n    console.error(JSON.stringify({\n      function: FUNCTION_NAME,\n      event: "post_analysis_guidance_failed",\n      operation_id: operation.id,\n      error: truncate(error instanceof Error ? error.message : error),\n    }));\n  }\n  await recordSpan({'''
)

path.write_text(text, encoding='utf-8')
