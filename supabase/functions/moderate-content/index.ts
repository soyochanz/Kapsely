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

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
    headers: { Authorization: `Bearer ${openaiApiKey}` },
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
  return top ? `Contenido enviado a revision por senal alta en ${top[0]}` : "Contenido no permitido";
};

const scoreAtLeast = (scores: Record<string, number>, key: string, threshold: number) =>
  (scores[key] ?? 0) >= threshold;

const isSevereCategoryHit = (categories: Record<string, boolean>, scores: Record<string, number>) => {
  if (categories["sexual/minors"] || categories["self-harm/instructions"]) return true;
  if (scoreAtLeast(scores, "sexual/minors", 0.08)) return true;
  if (scoreAtLeast(scores, "violence/graphic", 0.35)) return true;
  if (scoreAtLeast(scores, "self-harm/instructions", 0.25)) return true;
  return false;
};

const shouldBlock = (
  mediaType: string | null | undefined,
  categories: Record<string, boolean>,
  scores: Record<string, number>,
  flagged: boolean,
) => {
  if (isSevereCategoryHit(categories, scores)) return true;

  // Video moderation is based on one or a few representative thumbnails plus text,
  // so we should be stricter only for genuinely severe signals and otherwise prefer review.
  if (mediaType === "video") {
    if (categories["sexual"] && scoreAtLeast(scores, "sexual", 0.92)) return true;
    if (categories["violence"] && scoreAtLeast(scores, "violence", 0.96)) return true;
    if (flagged && scoreAtLeast(scores, "harassment/threatening", 0.97)) return true;
    return false;
  }

  if (flagged) return true;
  if (categories["sexual"] && scoreAtLeast(scores, "sexual", 0.88)) return true;
  if (categories["violence"] && scoreAtLeast(scores, "violence", 0.94)) return true;
  return false;
};

const shouldReview = (
  mediaType: string | null | undefined,
  categories: Record<string, boolean>,
  scores: Record<string, number>,
  flagged: boolean,
) => {
  if (shouldBlock(mediaType, categories, scores, flagged)) return false;
  if (mediaType === "video") {
    if (flagged) return true;
    if (categories["sexual"] && scoreAtLeast(scores, "sexual", 0.55)) return true;
    if (categories["violence"] && scoreAtLeast(scores, "violence", 0.65)) return true;
    if (categories["violence/graphic"] && scoreAtLeast(scores, "violence/graphic", 0.2)) return true;
    if (categories["self-harm"] && scoreAtLeast(scores, "self-harm", 0.45)) return true;
    return false;
  }
  return false;
};

const parseJsonSafe = async (response: Response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw_text: text };
  }
};

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !openaiApiKey) {
      return jsonResponse({
        ok: false,
        action: "review",
        status: "error",
        reason: "Moderation service is not configured",
        debug_stage: "env",
      }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return jsonResponse({
        ok: false,
        action: "review",
        status: "error",
        reason: authError?.message || "Unauthorized",
        debug_stage: "auth",
      }, 401);
    }

    const body = (await req.json()) as ModerationBody;
    const ownerId = body.owner_id || authData.user.id;
    if (ownerId !== authData.user.id) {
      return jsonResponse({
        ok: false,
        action: "review",
        status: "error",
        reason: "Forbidden",
        debug_stage: "owner_check",
      }, 403);
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

        return jsonResponse({
          ok: false,
          action: "review",
          status: "error",
          reason: "No se pudo revisar el audio. Intentalo de nuevo.",
          review_id: review?.id ?? null,
          debug_stage: "audio_transcription",
        }, 502);
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

      return jsonResponse({
        ok: true,
        action: "allow",
        status: "approved",
        review_id: review?.id ?? null,
        debug_stage: "noop_allow",
      });
    }

    const moderationResponse = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input,
      }),
    });

    const moderationJson = await parseJsonSafe(moderationResponse);
    if (!moderationResponse.ok) {
      const reason = (moderationJson as any)?.error?.message || "OpenAI moderation request failed";
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

      return jsonResponse({
        ok: false,
        action: "review",
        status: "error",
        reason,
        review_id: review?.id ?? null,
        debug_stage: "openai_moderation",
      }, 502);
    }

    const result = (moderationJson as any)?.results?.[0] ?? {};
    const categories = result.categories ?? {};
    const categoryScores = result.category_scores ?? {};
    const flagged = Boolean(result.flagged);
    const blocked = shouldBlock(body.media_type, categories, categoryScores, flagged);
    const reviewNeeded = shouldReview(body.media_type, categories, categoryScores, flagged);
    const status = blocked ? "rejected" : reviewNeeded ? "needs_review" : "approved";
    const action = blocked ? "block" : reviewNeeded ? "review" : "allow";
    const reason = blocked
      ? categoryReason(categories, categoryScores)
      : reviewNeeded
        ? "Video enviado a revision manual por senales ambiguas en la miniatura o el texto"
        : "Contenido aprobado";

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
      return jsonResponse({
        ok: false,
        action: "review",
        status: "error",
        reason: reviewError.message,
        debug_stage: "review_insert",
      }, 500);
    }

    return jsonResponse({
      ok: !blocked && !reviewNeeded,
      action,
      status,
      reason,
      flagged,
      categories,
      category_scores: categoryScores,
      review_id: review?.id ?? null,
      debug_stage: "done",
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      action: "review",
      status: "error",
      reason: error instanceof Error ? error.message : "Unknown moderation error",
      debug_stage: "uncaught",
    }, 500);
  }
});
