import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const url = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const cronSecret = Deno.env.get("NOTIFICATION_CRON_SECRET") || "";
const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN") || "";
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ detail: "Not authorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!expoAccessToken) {
    return new Response(
      JSON.stringify({ detail: "Expo push security token is not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // Expo first returns tickets, then asynchronous receipts. Checking receipts
  // is required to stop sending to invalid devices and to surface delivery
  // failures that are not known when the request is initially accepted.
  const pendingReceipts = await supabase
    .from("push_tickets")
    .select("ticket_id,push_token_id")
    .is("checked_at", null)
    .order("created_at")
    .limit(1000);
  if (pendingReceipts.data?.length) {
    const receiptResponse = await fetch(
      "https://exp.host/--/api/v2/push/getReceipts",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${expoAccessToken}`,
        },
        body: JSON.stringify({
          ids: pendingReceipts.data.map((ticket) => ticket.ticket_id),
        }),
      },
    );
    if (receiptResponse.ok) {
      const receiptPayload = await receiptResponse.json();
      for (const ticket of pendingReceipts.data) {
        const receipt = receiptPayload.data?.[ticket.ticket_id];
        if (!receipt) continue;
        const error =
          receipt.status === "error"
            ? receipt.details?.error ||
              receipt.message ||
              "Push delivery failed"
            : null;
        await supabase
          .from("push_tickets")
          .update({ checked_at: new Date().toISOString(), error })
          .eq("ticket_id", ticket.ticket_id);
        if (receipt.details?.error === "DeviceNotRegistered") {
          await supabase
            .from("push_tokens")
            .update({ disabled: true })
            .eq("id", ticket.push_token_id);
        }
      }
    }
  }

  const outbox = await supabase
    .from("notification_outbox")
    .select(
      "id,attempts,notification:notifications(id,user_id,type,title,body,data)",
    )
    .is("delivered_at", null)
    .lt("attempts", 8)
    .order("created_at")
    .limit(100);

  let delivered = 0;
  for (const item of outbox.data || []) {
    const notification: any = item.notification;
    if (!notification) continue;
    const [profile, tokens] = await Promise.all([
      supabase
        .from("profiles")
        .select("notification_preferences")
        .eq("id", notification.user_id)
        .maybeSingle(),
      supabase
        .from("push_tokens")
        .select("id,token")
        .eq("user_id", notification.user_id)
        .eq("disabled", false),
    ]);
    const prefs = profile.data?.notification_preferences || {};
    const preferenceKey =
      notification.type === "no_show" ? "absence" : notification.type;
    if (
      prefs.mute_all ||
      prefs[preferenceKey] === false ||
      !tokens.data?.length
    ) {
      await supabase
        .from("notification_outbox")
        .update({ delivered_at: new Date().toISOString() })
        .eq("id", item.id);
      delivered++;
      continue;
    }

    const payload = tokens.data.map((token: any) => ({
      to: token.token,
      title:
        notification.type === "emergency"
          ? "Urgent VIP Kids safety alert"
          : "VIP Kids Transportation",
      body: "Open the app to view this private ride update.",
      sound: "default",
      priority: "high",
      channelId: "vipkids-safety",
      data: {
        ...notification.data,
        type: notification.type,
        notification_id: notification.id,
      },
    }));

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${expoAccessToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok)
        throw new Error(`Expo push returned ${response.status}`);
      const result = await response.json();
      const tickets = Array.isArray(result.data) ? result.data : [];
      for (let index = 0; index < tickets.length; index++) {
        if (tickets[index]?.details?.error === "DeviceNotRegistered") {
          await supabase
            .from("push_tokens")
            .update({ disabled: true })
            .eq("id", tokens.data[index].id);
        } else if (tickets[index]?.id) {
          await supabase.from("push_tickets").upsert({
            ticket_id: tickets[index].id,
            push_token_id: tokens.data[index].id,
            notification_id: notification.id,
          });
        }
      }
      await supabase
        .from("notification_outbox")
        .update({
          delivered_at: new Date().toISOString(),
          attempts: item.attempts + 1,
          last_error: null,
        })
        .eq("id", item.id);
      delivered++;
    } catch (error) {
      await supabase
        .from("notification_outbox")
        .update({
          attempts: item.attempts + 1,
          last_error:
            error instanceof Error
              ? error.message.slice(0, 500)
              : "Unknown delivery error",
        })
        .eq("id", item.id);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed: outbox.data?.length || 0,
      delivered,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
