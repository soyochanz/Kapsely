/// <reference lib="deno.ns" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ModerationBody = {
  owner_id?: string;
  capsule_id?: string | null;
  media_url?: string | null;
  thumbnail_url?: string | null;
  media_type?: string | null;
  content?: string | null;
  caption?: string | null;
  metadata?: Record<string, unknown> | null;
};

const OPENAI_MODEL = "omni-moderation-latest";

const truncate = (value: unknown, max = 1200) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

const isHttpUrl = (value?: string | null) => !!value && /^https?:\/\//i.test(value);

const metadataToText = (metadata?: Record<string, unknown> | null) => {
  if (!metadata) return "";
  const textBits: string[] = [];
  const texts = Array.isArray(metadata.texts) ? metadata.texts : [];
  for (const item of texts) {
    if (item && typeof item === "object" && "text" in item) {
      textBits.push(String((item as { text?: unknown }).text ?? ""));
    }
  }
  if (typeof metadata.locationName === "string") textBits.push(metadata.locationName);
  return textBits.join("\n");
};

const transcribeAudio = async (openaiApiKey: string, mediaUrl?: string | null) => {
  if (!isHttpUrl(mediaUrl)) return "";
  const audioResponse = await fetch(mediaUrl);
  if (!audioResponse.ok) return "";
  const length = Number(audioResponse.headers.get("content-length") || "0");
  if (length > 24 * 1024 * 1024) return "";

  const blob = await audioResponse.blob();
  const form = new FormData();
  form.append("file", blob, "audio.m4a");
  form.append("model", "whisper-1");
  form.append("response_format", "json");

  const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiApiKey}` },
    body: form,
  });

  if (!transcriptionResponse.ok) return "";
  const transcription = await transcriptionResponse.json();
  return truncate(transcription?.text, 2400);
};

const categoryReason = (categories: Record<string, boolean>, scores: Record<string, number>) => {
  const active = Object.entries(categories)
    .filter(([, flagged]) => flagged)
    .map(([name]) => name);
  if (active.length > 0) return `Contenido bloqueado por: ${active.join(", ")}`;

  const top = Object.entries(scores)
    .sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  return top ? `Contenido enviado a revisión por señal alta en ${top[0]}` : "Contenido no permitido";
};

const shouldBlock = (categories: Record<string, boolean>, scores: Record<string, number>, flagged: boolean) => {
  if (flagged) return true;
  if (categories["sexual/minors"] || categories["self-harm/instructions"]) return true;
  if ((scores["sexual/minors"] ?? 0) >= 0.08) return true;
  if ((scores["violence/graphic"] ?? 0) >= 0.35) return true;
  if ((scores["self-harm/instructions"] ?? 0) >= 0.25) return true;
  return false;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !openaiApiKey) {
    return new Response(JSON.stringify({ error: "Moderation service is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = (await req.json()) as ModerationBody;
  const ownerId = body.owner_id || authData.user.id;
  if (ownerId !== authData.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const audioTranscript = body.media_type === "audio"
    ? await transcribeAudio(openaiApiKey, body.media_url)
    : "";

  const contentText = [
    truncate(body.caption),
    truncate(body.content),
    audioTranscript,
    truncate(metadataToText(body.metadata)),
  ].filter(Boolean).join("\n");

  const imageUrl = body.media_type === "video"
    ? body.thumbnail_url
    : body.media_type === "image"
      ? body.media_url
      : null;

  const input: Array<Record<string, unknown>> = [];
  if (contentText) input.push({ type: "text", text: contentText });
  if (isHttpUrl(imageUrl)) input.push({ type: "image_url", image_url: { url: imageUrl } });

  if (input.length === 0) {
    if (body.media_type === "audio") {
      const { data: review } = await adminClient.from("content_moderation_reviews").insert({
        owner_id: ownerId,
        capsule_id: body.capsule_id ?? null,
        media_type: body.media_type ?? null,
        media_url: body.media_url ?? null,
        content_excerpt: null,
        status: "error",
        action: "review",
        reason: "No se pudo transcribir el audio para moderarlo",
        model: OPENAI_MODEL,
      }).select("id").single();

      return new Response(JSON.stringify({
        ok: false,
        action: "review",
        status: "error",
        reason: "No se pudo revisar el audio. Inténtalo de nuevo.",
        review_id: review?.id ?? null,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: review } = await adminClient.from("content_moderation_reviews").insert({
      owner_id: ownerId,
      capsule_id: body.capsule_id ?? null,
      media_type: body.media_type ?? null,
      media_url: body.media_url ?? null,
      content_excerpt: null,
      status: "approved",
      action: "allow",
      reason: "No text or server-readable image to moderate",
      model: OPENAI_MODEL,
    }).select("id").single();

    return new Response(JSON.stringify({
      ok: true,
      action: "allow",
      status: "approved",
      review_id: review?.id ?? null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const moderationResponse = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input,
    }),
  });

  const moderationJson = await moderationResponse.json();
  if (!moderationResponse.ok) {
    const reason = moderationJson?.error?.message || "OpenAI moderation request failed";
    const { data: review } = await adminClient.from("content_moderation_reviews").insert({
      owner_id: ownerId,
      capsule_id: body.capsule_id ?? null,
      media_type: body.media_type ?? null,
      media_url: body.media_url ?? null,
      content_excerpt: contentText.slice(0, 500),
      status: "error",
      action: "review",
      reason,
      model: OPENAI_MODEL,
      raw_response: moderationJson,
    }).select("id").single();

    return new Response(JSON.stringify({
      ok: false,
      action: "review",
      status: "error",
      reason,
      review_id: review?.id ?? null,
    }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result = moderationJson?.results?.[0] ?? {};
  const categories = result.categories ?? {};
  const categoryScores = result.category_scores ?? {};
  const flagged = Boolean(result.flagged);
  const blocked = shouldBlock(categories, categoryScores, flagged);
  const status = blocked ? "rejected" : "approved";
  const action = blocked ? "block" : "allow";
  const reason = blocked ? categoryReason(categories, categoryScores) : "Contenido aprobado";

  const { data: review, error: reviewError } = await adminClient.from("content_moderation_reviews").insert({
    owner_id: ownerId,
    capsule_id: body.capsule_id ?? null,
    media_type: body.media_type ?? null,
    media_url: body.media_url ?? null,
    content_excerpt: contentText.slice(0, 500),
    status,
    action,
    reason,
    model: OPENAI_MODEL,
    categories,
    category_scores: categoryScores,
    raw_response: moderationJson,
  }).select("id").single();

  if (reviewError) {
    return new Response(JSON.stringify({ error: reviewError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    ok: !blocked,
    action,
    status,
    reason,
    flagged,
    categories,
    category_scores: categoryScores,
    review_id: review?.id ?? null,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
