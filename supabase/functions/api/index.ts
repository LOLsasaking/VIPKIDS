import {
  createClient,
  SupabaseClient,
} from "npm:@supabase/supabase-js@2.111.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const allowedOrigins = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const service = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Profile = {
  id: string;
  email: string;
  role: "admin" | "parent" | "driver" | "child";
  status: string;
  full_name: string;
  phone?: string;
  address?: string;
  photo_url?: string;
  notification_preferences?: Record<string, boolean>;
  on_duty?: boolean;
  active_route_session_id?: string;
  license_number?: string;
  license_expiry?: string;
  permit_expiry?: string;
};

function cors(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = !origin || allowedOrigins.has(origin);
  return {
    "Access-Control-Allow-Origin": origin && allowed ? origin : "",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}

function reply(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}

function failure(req: Request, status: number, detail: string) {
  return reply(req, { detail }, status);
}

async function body(req: Request) {
  if (!["POST", "PUT", "PATCH"].includes(req.method)) return {};
  const size = Number(req.headers.get("content-length") || 0);
  if (size > 2_500_000) throw new Error("REQUEST_TOO_LARGE");
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > 2_500_000)
    throw new Error("REQUEST_TOO_LARGE");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function profileOut(profile: Profile) {
  return {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    status: profile.status,
    name: profile.full_name,
    phone: profile.phone,
    address: profile.address,
    photo_url: profile.photo_url,
    notif_prefs: profile.notification_preferences,
    on_duty: profile.on_duty,
    route_session_id: profile.active_route_session_id,
    license_number: profile.license_number,
    license_expiry: profile.license_expiry,
    permit_expiry: profile.permit_expiry,
  };
}

function childSafeDriverOut(profile: Profile) {
  return {
    id: profile.id,
    name: profile.full_name,
    phone: profile.phone,
    photo_url: profile.photo_url,
  };
}

function childOut(row: any) {
  return {
    ...row,
    name: row.full_name,
    driver_id: row.assigned_driver_id,
    vehicle_id: row.assigned_vehicle_id,
    full_name: undefined,
    assigned_driver_id: undefined,
    assigned_vehicle_id: undefined,
  };
}

function vehicleOut(row: any) {
  return { ...row, photo_url: row.image_url, image_url: undefined };
}

function eventOut(row: any) {
  return {
    ...row,
    event_type: row.status,
    message: row.note,
    status: undefined,
    note: undefined,
  };
}

function scheduleOut(row: any) {
  return { ...row, when: row.requested_when, requested_when: undefined };
}

async function authenticate(req: Request): Promise<Profile | null> {
  const value = req.headers.get("authorization") || "";
  const token = value.startsWith("Bearer ") ? value.slice(7) : "";
  if (!token) return null;
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) return null;
  const result = await service
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle();
  return result.data as Profile | null;
}

function assuranceLevel(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(
    /^Bearer /,
    "",
  );
  try {
    let payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    payload += "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(payload)).aal || "aal1";
  } catch {
    return "aal1";
  }
}

function requireRole(profile: Profile | null, ...roles: Profile["role"][]) {
  return (
    !!profile && profile.status === "active" && roles.includes(profile.role)
  );
}

async function enrichChild(row: any, includeAccess = false) {
  const output: any = childOut(row);
  if (row.assigned_driver_id) {
    const result = await service
      .from("profiles")
      .select("*")
      .eq("id", row.assigned_driver_id)
      .maybeSingle();
    if (result.data) output.driver = profileOut(result.data as Profile);
  }
  if (row.assigned_vehicle_id) {
    const result = await service
      .from("vehicles")
      .select("*")
      .eq("id", row.assigned_vehicle_id)
      .maybeSingle();
    if (result.data) output.vehicle = vehicleOut(result.data);
  }
  if (includeAccess && row.child_account_id) {
    const result = await service
      .from("profiles")
      .select("id,email,status,guardian_consent_confirmed_at")
      .eq("id", row.child_account_id)
      .maybeSingle();
    output.child_account = result.data;
  }
  return output;
}

async function freshLocation(driverId?: string) {
  if (!driverId) return null;
  const result = await service
    .from("live_locations")
    .select("*")
    .eq("driver_id", driverId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  const row = result.data;
  return row
    ? {
        lat: row.latitude,
        lng: row.longitude,
        updated_at: row.recorded_at,
        route_session_id: row.route_session_id,
      }
    : null;
}

async function notify(
  userId: string,
  type: string,
  title: string,
  notificationBody: string,
  data: Record<string, unknown> = {},
) {
  await service.rpc("enqueue_notification", {
    target_user_id: userId,
    notification_type: type,
    notification_title: title,
    notification_body: notificationBody,
    notification_data: { ...data, type },
  });
}

async function audit(
  actorId: string | null,
  eventType: string,
  subjectType?: string,
  subjectId?: string,
  metadata: Record<string, unknown> = {},
) {
  await service.from("audit_events").insert({
    actor_id: actorId,
    event_type: eventType,
    subject_type: subjectType || null,
    subject_id: subjectId || null,
    metadata,
  });
}

const titles: Record<string, (name: string) => string> = {
  on_the_way: (n) => `Driver on the way to ${n}`,
  approaching: (n) => `Driver is approaching ${n}`,
  picked_up: (n) => `${n} has been picked up`,
  arrived_school: (n) => `${n} arrived at school`,
  leaving_school: (n) => `${n} is leaving school`,
  arriving_home: (n) => `${n} is almost home`,
  arrived_home: (n) => `${n} arrived home`,
  delay: (n) => `Traffic delay for ${n}`,
  no_show: (n) => `${n} did not show up for pickup`,
};

const messages: Record<string, (name: string) => string> = {
  on_the_way: (n) => `Your driver is heading to pick up ${n}.`,
  approaching: (n) => `Your driver is approaching ${n}'s pickup location.`,
  picked_up: (n) => `${n} is safely in the vehicle.`,
  arrived_school: (n) => `${n} arrived safely at school.`,
  leaving_school: (n) => `${n} just left school.`,
  arriving_home: (n) => `${n} will arrive home shortly.`,
  arrived_home: (n) => `${n} was safely dropped off at home.`,
  delay: () => "There is a traffic delay on the route.",
  no_show: (n) => `${n} was not present at pickup. Please contact your driver.`,
};

async function routeTracking(child: any) {
  const location = await freshLocation(child.assigned_driver_id);
  let routePoints: any[] = [];
  let plannedRoutePoints: any[] = [];
  let routePhase: string | null = null;
  if (location?.route_session_id) {
    const cutoff = new Date(Date.now() - 120_000).toISOString();
    const points = await service
      .from("route_points")
      .select("latitude,longitude,recorded_at")
      .eq("route_session_id", location.route_session_id)
      .gte("recorded_at", cutoff)
      .order("recorded_at");
    routePoints = (points.data || []).map((point: any) => ({
      lat: point.latitude,
      lng: point.longitude,
      recorded_at: point.recorded_at,
    }));
    const session = await service
      .from("route_sessions")
      .select("phase,planned_geometry")
      .eq("id", location.route_session_id)
      .maybeSingle();
    routePhase = session.data?.phase || null;
    plannedRoutePoints = Array.isArray(session.data?.planned_geometry)
      ? session.data.planned_geometry
      : [];
  }
  return {
    location,
    route_points: routePoints,
    planned_route_points: plannedRoutePoints,
    planned_addresses: [],
    route_phase: routePhase,
  };
}

async function deleteAccount(user: Profile) {
  if (user.role === "admin") throw new Error("ADMIN_DELETE_BLOCKED");
  if (user.role === "driver" && user.on_duty) throw new Error("ACTIVE_ROUTE");
  if (user.role === "parent") {
    const children = await service
      .from("children")
      .select("child_account_id")
      .eq("parent_id", user.id);
    for (const child of children.data || []) {
      if (child.child_account_id)
        await service.auth.admin.deleteUser(child.child_account_id);
    }
  }
  if (user.role === "driver") {
    await service
      .from("children")
      .update({
        assigned_driver_id: null,
        assigned_vehicle_id: null,
        assignment_status: "pending_admin_assignment",
      })
      .eq("assigned_driver_id", user.id);
    await service.from("attendance_events").delete().eq("driver_id", user.id);
    await service.from("emergency_events").delete().eq("driver_id", user.id);
    await service.from("routes").delete().eq("driver_id", user.id);
    await service.from("route_sessions").delete().eq("driver_id", user.id);
    await service
      .from("vehicles")
      .update({ driver_id: null })
      .eq("driver_id", user.id);
  }
  const result = await service.auth.admin.deleteUser(user.id);
  if (result.error) throw result.error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors(req) });
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigins.has(origin))
    return failure(req, 403, "Origin not allowed");

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/api/, "") || "/";
  let input: any = {};
  try {
    input = await body(req);
  } catch (error) {
    return failure(
      req,
      error instanceof Error && error.message === "REQUEST_TOO_LARGE"
        ? 413
        : 400,
      "Invalid request body",
    );
  }

  if (path === "/auth/register" && req.method === "POST") {
    if (
      !["parent", "driver"].includes(input.role) ||
      !input.email ||
      !input.password ||
      String(input.password).length < 12 ||
      !input.name
    ) {
      return failure(req, 400, "Enter a valid parent or driver access request");
    }
    const client = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const registration = await client.auth.signUp({
      email: String(input.email).trim().toLowerCase(),
      password: input.password,
      options: {
        data: {
          role: input.role,
          name: String(input.name).trim(),
          phone: input.phone || "",
          address: input.address || "",
        },
      },
    });
    if (registration.error)
      return failure(req, 400, "Access request could not be submitted. Check the information and try again.");
    return reply(
      req,
      {
        ok: true,
        status: "pending",
        message: "Access request submitted for administrator approval.",
      },
      201,
    );
  }

  if (path === "/auth/delete-account" && req.method === "POST") {
    if (input.confirmation !== "DELETE" || !input.email || !input.password)
      return failure(req, 400, "Confirm account deletion");
    const client = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = await client.auth.signInWithPassword({
      email: String(input.email).toLowerCase(),
      password: input.password,
    });
    if (signedIn.error || !signedIn.data.user)
      return failure(req, 401, "Invalid email or password");
    const found = await service
      .from("profiles")
      .select("*")
      .eq("id", signedIn.data.user.id)
      .single();
    try {
      await deleteAccount(found.data as Profile);
    } catch (error) {
      return failure(
        req,
        409,
        error instanceof Error && error.message === "ACTIVE_ROUTE"
          ? "End the active route before deleting this account"
          : "Account cannot be deleted here",
      );
    }
    return reply(req, {
      ok: true,
      message: "Account and associated personal data deleted",
    });
  }

  const user = await authenticate(req);
  if (!user) return failure(req, 401, "Not authenticated");
  if (user.status !== "active")
    return failure(
      req,
      403,
      user.status === "suspended"
        ? "Account suspended"
        : "Account awaiting administrator approval and assignment",
    );

  if (path === "/auth/me" && req.method === "GET")
    return reply(req, profileOut(user));
  if (path === "/auth/notif-prefs" && req.method === "PUT") {
    await service
      .from("profiles")
      .update({
        notification_preferences: input,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    return reply(req, { ok: true, notif_prefs: input });
  }
  if (path === "/auth/photo" && req.method === "PUT") {
    const photo = String(input.photo_url || "");
    const supportedDataImage =
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo);
    if (
      (!photo.startsWith("https://") && !supportedDataImage) ||
      photo.length > 2_000_000
    )
      return failure(req, 400, "Use a supported image smaller than 1.5 MB");
    await service
      .from("profiles")
      .update({ photo_url: photo, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    return reply(req, { ok: true, photo_url: photo });
  }

  if (path === "/push/register" && req.method === "POST") {
    if (
      !/^Expo(nent)?PushToken\[[^\]]+\]$/.test(input.token || "") ||
      !["android", "ios"].includes(input.platform)
    )
      return failure(req, 400, "Unsupported push token");
    await service
      .from("push_tokens")
      .update({ disabled: true, updated_at: new Date().toISOString() })
      .eq("token", input.token)
      .neq("user_id", user.id);
    await service.from("push_tokens").upsert(
      {
        user_id: user.id,
        token: input.token,
        platform: input.platform,
        disabled: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    return reply(req, { ok: true });
  }
  if (path === "/push/unregister" && req.method === "POST") {
    await service
      .from("push_tokens")
      .update({ disabled: true, updated_at: new Date().toISOString() })
      .eq("token", input.token)
      .eq("user_id", user.id);
    return reply(req, { ok: true });
  }

  if (
    (path === "/parent/children" || path === "/parent/dashboard") &&
    req.method === "GET"
  ) {
    if (!requireRole(user, "parent"))
      return failure(req, 403, "Parent access required");
    const rows = await service
      .from("children")
      .select("*")
      .eq("parent_id", user.id)
      .order("pickup_time");
    const children = await Promise.all(
      (rows.data || []).map(async (row: any) => {
        const enriched = await enrichChild(row);
        const latest = await service
          .from("attendance_events")
          .select("*")
          .eq("child_id", row.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        enriched.latest_event = latest.data ? eventOut(latest.data) : null;
        return enriched;
      }),
    );
    if (path === "/parent/children") return reply(req, children);
    const announcements = await service
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);
    return reply(req, { children, announcements: announcements.data || [] });
  }

  if (path === "/parent/children" && req.method === "POST") {
    if (!requireRole(user, "parent"))
      return failure(req, 403, "Parent access required");
    if (input.guardian_consent_confirmed !== true)
      return failure(req, 400, "Parent or guardian authorization is required");
    if (
      !input.child_email ||
      !input.child_password ||
      String(input.child_password).length < 12
    )
      return failure(req, 400, "Child email and password are required");
    const account = await service.auth.admin.createUser({
      email: String(input.child_email).toLowerCase(),
      password: input.child_password,
      email_confirm: true,
      user_metadata: { role: "child", name: input.name },
    });
    if (account.error || !account.data.user)
      return failure(req, 400, "Unable to create child sign-in");
    await service
      .from("profiles")
      .update({
        status: "active",
        guardian_consent_confirmed_at: new Date().toISOString(),
        guardian_consent_confirmed_by: user.id,
      })
      .eq("id", account.data.user.id);
    const inserted = await service
      .from("children")
      .insert({
        parent_id: user.id,
        child_account_id: account.data.user.id,
        full_name: input.name,
        school: input.school,
        home_address: input.home_address,
        school_address: input.school_address,
        pickup_time: input.pickup_time,
        dropoff_time: input.dropoff_time,
        grade: input.grade || null,
        birth_date: input.birth_date || null,
        round_trip: input.round_trip !== false,
        emergency_contact_name: input.emergency_contact_name || null,
        emergency_contact_phone: input.emergency_contact_phone || null,
        contact_phone: input.contact_phone || null,
      })
      .select("*")
      .single();
    if (inserted.error) {
      await service.auth.admin.deleteUser(account.data.user.id);
      return failure(req, 400, "Unable to create child record");
    }
    const admins = await service
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .eq("status", "active");
    await Promise.all(
      (admins.data || []).map((admin: any) =>
        notify(
          admin.id,
          "child_pending_assignment",
          "Child added by parent",
          `${user.full_name} added ${input.name}. Assign a driver and vehicle.`,
        ),
      ),
    );
    return reply(
      req,
      {
        ...(await enrichChild(inserted.data)),
        child_account: {
          id: account.data.user.id,
          email: input.child_email,
          status: "active",
        },
      },
      201,
    );
  }

  const parentChildMatch = path.match(
    /^\/parent\/(?:track|child)\/([0-9a-f-]+)$/i,
  );
  if (parentChildMatch && req.method === "GET") {
    if (!requireRole(user, "parent"))
      return failure(req, 403, "Parent access required");
    const found = await service
      .from("children")
      .select("*")
      .eq("id", parentChildMatch[1])
      .eq("parent_id", user.id)
      .maybeSingle();
    if (!found.data) return failure(req, 404, "Child not found");
    if (path.includes("/parent/child/"))
      return reply(req, await enrichChild(found.data));
    const events = await service
      .from("attendance_events")
      .select("*")
      .eq("child_id", found.data.id)
      .order("created_at", { ascending: false })
      .limit(10);
    return reply(req, {
      child: await enrichChild(found.data),
      ...(await routeTracking(found.data)),
      events: (events.data || []).map(eventOut),
    });
  }

  if (path === "/parent/schedule-requests" && req.method === "GET") {
    if (!requireRole(user, "parent"))
      return failure(req, 403, "Parent access required");
    const rows = await service
      .from("schedule_requests")
      .select("*")
      .eq("parent_id", user.id)
      .order("created_at", { ascending: false });
    return reply(req, (rows.data || []).map(scheduleOut));
  }
  if (path === "/parent/schedule-request" && req.method === "POST") {
    if (!requireRole(user, "parent"))
      return failure(req, 403, "Parent access required");
    const owned = await service
      .from("children")
      .select("id")
      .eq("id", input.child_id)
      .eq("parent_id", user.id)
      .maybeSingle();
    if (!owned.data) return failure(req, 404, "Child not found");
    if (!String(input.when || "").trim() || String(input.when).length > 120)
      return failure(req, 400, "Enter a valid requested date and time");
    const inserted = await service
      .from("schedule_requests")
      .insert({
        parent_id: user.id,
        child_id: input.child_id,
        request_type: input.request_type,
        requested_when: String(input.when).trim(),
        pickup_address: input.pickup_address || null,
        dropoff_address: input.dropoff_address || null,
        notes: input.notes || null,
      })
      .select("*")
      .single();
    if (!inserted.error)
      await audit(
        user.id,
        "schedule_request_created",
        "child",
        input.child_id,
        { request_type: input.request_type },
      );
    return inserted.error
      ? failure(req, 400, "Unable to submit request")
      : reply(req, scheduleOut(inserted.data), 201);
  }

  if (path === "/child/track" && req.method === "GET") {
    if (!requireRole(user, "child"))
      return failure(req, 403, "Child access required");
    const found = await service
      .from("children")
      .select("*")
      .eq("child_account_id", user.id)
      .maybeSingle();
    if (!found.data) return failure(req, 404, "Child assignment not found");
    const child = found.data;
    const events = await service
      .from("attendance_events")
      .select("*")
      .eq("child_id", child.id)
      .order("created_at", { ascending: false })
      .limit(10);
    const enriched = await enrichChild(child);
    const safeChild = {
      id: child.id,
      name: child.full_name,
      school: child.school,
      pickup_time: child.pickup_time,
      dropoff_time: child.dropoff_time,
      emergency_contact_name: child.emergency_contact_name,
      emergency_contact_phone: child.emergency_contact_phone,
    };
    return reply(req, {
      child: safeChild,
      driver: enriched.driver
        ? childSafeDriverOut({
            ...enriched.driver,
            full_name: enriched.driver.name,
          } as Profile)
        : null,
      vehicle: enriched.vehicle,
      ...(await routeTracking(child)),
      events: (events.data || []).map(eventOut),
    });
  }
  if (path === "/child/ready" && req.method === "POST") {
    if (!requireRole(user, "child"))
      return failure(req, 403, "Child access required");
    const found = await service
      .from("children")
      .select("*")
      .eq("child_account_id", user.id)
      .maybeSingle();
    if (!found.data) return failure(req, 404, "Child assignment not found");
    const child = found.data;
    await Promise.all(
      [child.parent_id, child.assigned_driver_id]
        .filter(Boolean)
        .map((id: string) =>
          notify(
            id,
            "child_ready",
            `${child.full_name} is ready`,
            "Ready for the assigned pickup.",
            { child_id: child.id },
          ),
        ),
    );
    return reply(req, {
      ok: true,
      message: "Your assigned driver and parent were notified.",
    });
  }

  if (path === "/driver/today" && req.method === "GET") {
    if (!requireRole(user, "driver"))
      return failure(req, 403, "Driver access required");
    const rows = await service
      .from("children")
      .select("*")
      .eq("assigned_driver_id", user.id)
      .order("pickup_time");
    const output = await Promise.all(
      (rows.data || []).map(async (row: any) => {
        const parent = await service
          .from("profiles")
          .select("*")
          .eq("id", row.parent_id)
          .maybeSingle();
        const latest = await service
          .from("attendance_events")
          .select("*")
          .eq("child_id", row.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return {
          ...childOut(row),
          parent: parent.data ? profileOut(parent.data as Profile) : null,
          latest_event: latest.data ? eventOut(latest.data) : null,
        };
      }),
    );
    return reply(req, output);
  }

  if (path === "/driver/route/start" && req.method === "POST") {
    if (!requireRole(user, "driver"))
      return failure(req, 403, "Driver access required");
    if (user.on_duty || user.active_route_session_id)
      return failure(req, 409, "An active route is already in progress");
    if (
      !input.seatbelts_checked ||
      !input.fuel_level_checked ||
      !input.phone_charged_and_mounted
    )
      return failure(req, 400, "Complete all three pre-route checks");
    const children = await service
      .from("children")
      .select("*")
      .eq("assigned_driver_id", user.id);
    if (!children.data?.length)
      return failure(req, 400, "No children are assigned to this driver");
    const route = await service
      .from("routes")
      .select("*")
      .eq("driver_id", user.id)
      .eq("phase", input.phase || "morning")
      .limit(1)
      .maybeSingle();
    const session = await service
      .from("route_sessions")
      .insert({
        route_id: route.data?.id || null,
        driver_id: user.id,
        vehicle_id:
          route.data?.vehicle_id || children.data[0].assigned_vehicle_id,
        phase: input.phase || "morning",
        precheck: {
          seatbelts_checked: true,
          fuel_level_checked: true,
          phone_charged_and_mounted: true,
        },
      })
      .select("*")
      .single();
    if (session.error) return failure(req, 400, "Unable to start route");
    await service
      .from("profiles")
      .update({
        on_duty: true,
        active_route_session_id: session.data.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    for (const child of children.data) {
      await service.from("attendance_events").insert({
        child_id: child.id,
        driver_id: user.id,
        route_session_id: session.data.id,
        status: "on_the_way",
        note: messages.on_the_way(child.full_name),
      });
      await notify(
        child.parent_id,
        "on_the_way",
        titles.on_the_way(child.full_name),
        messages.on_the_way(child.full_name),
        { child_id: child.id },
      );
    }
    await audit(user.id, "route_started", "route_session", session.data.id, {
      phase: session.data.phase,
      assigned_children: children.data.length,
    });
    return reply(req, {
      ok: true,
      on_duty: true,
      route_session_id: session.data.id,
      route_phase: session.data.phase,
    });
  }

  if (path === "/driver/location" && req.method === "POST") {
    if (!requireRole(user, "driver"))
      return failure(req, 403, "Driver access required");
    if (!user.on_duty || !user.active_route_session_id)
      return failure(
        req,
        409,
        "Start an assigned route before sharing location",
      );
    const latitude = Number(input.lat),
      longitude = Number(input.lng);
    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    )
      return failure(req, 400, "Invalid coordinates");
    const recordedAt = new Date().toISOString();
    await service.from("live_locations").upsert(
      {
        driver_id: user.id,
        route_session_id: user.active_route_session_id,
        latitude,
        longitude,
        recorded_at: recordedAt,
        expires_at: new Date(Date.now() + 45_000).toISOString(),
      },
      { onConflict: "driver_id" },
    );
    await service.from("route_points").insert({
      route_session_id: user.active_route_session_id,
      latitude,
      longitude,
      recorded_at: recordedAt,
      expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
    });
    return reply(req, { ok: true });
  }

  if (path === "/driver/route/plan" && req.method === "POST") {
    if (
      !requireRole(user, "driver") ||
      !user.on_duty ||
      !user.active_route_session_id
    )
      return failure(
        req,
        409,
        "Start the route before saving its planned path",
      );
    if (
      !Array.isArray(input.points) ||
      input.points.length < 2 ||
      input.points.length > 1000
    )
      return failure(req, 400, "Planned route needs 2–1000 points");
    await service
      .from("route_sessions")
      .update({ planned_geometry: input.points })
      .eq("id", user.active_route_session_id)
      .eq("driver_id", user.id);
    return reply(req, {
      ok: true,
      point_count: input.points.length,
      addresses: [],
    });
  }

  if (path === "/driver/route/end" && req.method === "POST") {
    if (!requireRole(user, "driver"))
      return failure(req, 403, "Driver access required");
    if (!input.all_children_accounted_for || !input.vehicle_checked_empty)
      return failure(
        req,
        400,
        "Complete both end-of-route safety confirmations",
      );
    const endingSessionId = user.active_route_session_id;
    if (user.active_route_session_id)
      await service
        .from("route_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", user.active_route_session_id)
        .eq("driver_id", user.id);
    await service.from("live_locations").delete().eq("driver_id", user.id);
    await service
      .from("profiles")
      .update({
        on_duty: false,
        active_route_session_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    const children = await service
      .from("children")
      .select("parent_id")
      .eq("assigned_driver_id", user.id);
    await Promise.all(
      (children.data || []).map((child: any) =>
        notify(
          child.parent_id,
          "route_completed",
          "Route completed",
          `${user.full_name} completed today's route and final vehicle check.`,
        ),
      ),
    );
    await audit(
      user.id,
      "route_ended",
      "route_session",
      endingSessionId || undefined,
      {
        all_children_accounted_for: true,
        vehicle_checked_empty: true,
      },
    );
    return reply(req, { ok: true, on_duty: false, safety_check: input });
  }

  if (path === "/driver/checkin" && req.method === "POST") {
    if (!requireRole(user, "driver"))
      return failure(req, 403, "Driver access required");
    const allowed = [
      "on_the_way",
      "approaching",
      "picked_up",
      "absent",
      "no_show",
      "arrived_school",
      "leaving_school",
      "arriving_home",
      "arrived_home",
      "delay",
      "alt_dropoff",
    ];
    const normalized = input.event_type;
    if (!allowed.includes(normalized))
      return failure(req, 400, "Unsupported route status");
    const child = await service
      .from("children")
      .select("*")
      .eq("id", input.child_id)
      .eq("assigned_driver_id", user.id)
      .maybeSingle();
    if (!child.data) return failure(req, 404, "Child not assigned to you");
    const event = await service
      .from("attendance_events")
      .insert({
        child_id: child.data.id,
        driver_id: user.id,
        route_session_id: user.active_route_session_id || null,
        status: normalized,
        note: input.message || null,
      })
      .select("*")
      .single();
    const type = normalized === "absent" ? "no_show" : normalized;
    await notify(
      child.data.parent_id,
      type,
      titles[type]?.(child.data.full_name) || "Ride update",
      input.message ||
        messages[type]?.(child.data.full_name) ||
        "Your ride status was updated.",
      { child_id: child.data.id },
    );
    await audit(user.id, `attendance_${type}`, "child", child.data.id, {
      route_session_id: user.active_route_session_id || null,
    });
    return reply(req, eventOut(event.data));
  }

  if (path === "/driver/emergency" && req.method === "POST") {
    if (!requireRole(user, "driver"))
      return failure(req, 403, "Driver access required");
    await service.from("emergency_events").insert({
      driver_id: user.id,
      route_session_id: user.active_route_session_id || null,
      latitude: input.lat || null,
      longitude: input.lng || null,
      message: input.message || null,
    });
    const admins = await service
      .from("profiles")
      .select("*")
      .eq("role", "admin")
      .eq("status", "active");
    await Promise.all(
      (admins.data || []).map((admin: any) =>
        notify(
          admin.id,
          "emergency",
          `SOS from ${user.full_name}`,
          input.message || "Driver requested immediate assistance.",
          { driver_id: user.id },
        ),
      ),
    );
    await audit(user.id, "emergency_sos", "driver", user.id, {
      route_session_id: user.active_route_session_id || null,
    });
    return reply(req, {
      ok: true,
      alerted_admins: admins.data?.length || 0,
      admin_phone:
        admins.data?.find((admin: any) => admin.phone)?.phone || null,
    });
  }

  if (path === "/chat/conversations" && req.method === "GET") {
    if (!requireRole(user, "parent", "driver"))
      return failure(
        req,
        403,
        "Messaging is limited to parents and assigned drivers",
      );
    const filter =
      user.role === "parent"
        ? ["parent_id", "assigned_driver_id"]
        : ["assigned_driver_id", "parent_id"];
    const children = await service
      .from("children")
      .select("*")
      .eq(filter[0], user.id);
    const seen = new Set<string>();
    const contacts = [];
    for (const child of children.data || []) {
      const id = child[filter[1]];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const contact = await service
        .from("profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (contact.data)
        contacts.push({
          user: profileOut(contact.data as Profile),
          child_name: child.full_name,
        });
    }
    return reply(req, contacts);
  }

  const chatMatch = path.match(/^\/chat\/messages\/([0-9a-f-]+)$/i);
  if (chatMatch && req.method === "GET") {
    const other = chatMatch[1];
    const assignment =
      user.role === "parent"
        ? await service
            .from("children")
            .select("id")
            .eq("parent_id", user.id)
            .eq("assigned_driver_id", other)
            .limit(1)
            .maybeSingle()
        : await service
            .from("children")
            .select("id")
            .eq("assigned_driver_id", user.id)
            .eq("parent_id", other)
            .limit(1)
            .maybeSingle();
    if (!assignment.data)
      return failure(req, 403, "Messaging is limited to active assignments");
    const rows = await service
      .from("messages")
      .select("*")
      .or(
        `and(from_user_id.eq.${user.id},to_user_id.eq.${other}),and(from_user_id.eq.${other},to_user_id.eq.${user.id})`,
      )
      .order("created_at");
    return reply(
      req,
      (rows.data || []).map((row: any) => ({
        ...row,
        text: row.body,
        body: undefined,
      })),
    );
  }

  if (path === "/chat/send" && req.method === "POST") {
    if (
      !requireRole(user, "parent", "driver") ||
      !input.to_user_id ||
      !String(input.text || "").trim()
    )
      return failure(req, 400, "Valid message required");
    const assignment =
      user.role === "parent"
        ? await service
            .from("children")
            .select("id")
            .eq("parent_id", user.id)
            .eq("assigned_driver_id", input.to_user_id)
            .limit(1)
            .maybeSingle()
        : await service
            .from("children")
            .select("id")
            .eq("assigned_driver_id", user.id)
            .eq("parent_id", input.to_user_id)
            .limit(1)
            .maybeSingle();
    if (!assignment.data)
      return failure(req, 403, "Messaging is limited to active assignments");
    const inserted = await service
      .from("messages")
      .insert({
        from_user_id: user.id,
        to_user_id: input.to_user_id,
        child_id: input.child_id || null,
        body: String(input.text).trim(),
      })
      .select("*")
      .single();
    await notify(
      input.to_user_id,
      "message",
      `Message from ${user.full_name}`,
      String(input.text).trim(),
      { child_id: input.child_id || null },
    );
    return reply(req, {
      ...inserted.data,
      text: inserted.data.body,
      body: undefined,
    });
  }

  if (path === "/notifications" && req.method === "GET") {
    const rows = await service
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    return reply(
      req,
      (rows.data || []).map((row: any) => ({ ...row, read: !!row.read_at })),
    );
  }
  const notificationMatch = path.match(
    /^\/notifications\/([0-9a-f-]+)\/read$/i,
  );
  if (notificationMatch && req.method === "POST") {
    await service
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationMatch[1])
      .eq("user_id", user.id);
    return reply(req, { ok: true });
  }
  if (path === "/announcements" && req.method === "GET") {
    const rows = await service
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    return reply(req, rows.data || []);
  }

  if (path.startsWith("/admin/")) {
    if (!requireRole(user, "admin"))
      return failure(req, 403, "Administrator access required");
    if (assuranceLevel(req) !== "aal2")
      return failure(
        req,
        403,
        "Administrator authenticator verification is required",
      );

    if (
      (path === "/admin/users" || path === "/admin/pending-users") &&
      req.method === "GET"
    ) {
      let query = service.from("profiles").select("*").order("full_name");
      const role = url.searchParams.get("role");
      if (path.includes("pending")) query = query.eq("status", "pending");
      if (role) query = query.eq("role", role);
      const rows = await query;
      return reply(req, (rows.data || []).map(profileOut));
    }
    const userAction =
      path.match(
        /^\/admin\/(?:approve|reject|activate-parent)\/([0-9a-f-]+)$/i,
      ) || path.match(/^\/admin\/users\/([0-9a-f-]+)\/(suspend|reactivate)$/i);
    if (userAction && req.method === "POST") {
      const id = userAction[1];
      const action = path.includes("/approve/")
        ? "approve"
        : path.includes("/reject/")
          ? "reject"
          : path.includes("/activate-parent/")
            ? "activate"
            : userAction[2];
      if (action === "reject") {
        const rejected = await service
          .from("profiles")
          .select("*")
          .eq("id", id)
          .single();
        if (rejected.data) await deleteAccount(rejected.data as Profile);
        await audit(user.id, "account_rejected", "profile", id);
        return reply(req, { ok: true });
      }
      if (action === "activate") {
        const assigned = await service
          .from("children")
          .select("id")
          .eq("parent_id", id)
          .not("assigned_driver_id", "is", null)
          .not("assigned_vehicle_id", "is", null)
          .limit(1);
        if (!assigned.data?.length)
          return failure(req, 400, "Assign a child, driver, and vehicle first");
      }
      const target = await service
        .from("profiles")
        .select("role")
        .eq("id", id)
        .single();
      const status =
        action === "suspend"
          ? "suspended"
          : action === "approve" && target.data?.role === "parent"
            ? "approved"
            : action === "approve" ||
                action === "reactivate" ||
                action === "activate"
              ? "active"
              : "pending";
      await service
        .from("profiles")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      await audit(user.id, `account_${action}`, "profile", id, { status });
      return reply(req, { ok: true, status });
    }

    const adminUser = path.match(/^\/admin\/users\/([0-9a-f-]+)$/i);
    if (adminUser && req.method === "DELETE") {
      const target = await service
        .from("profiles")
        .select("*")
        .eq("id", adminUser[1])
        .single();
      if (target.data?.role === "admin")
        return failure(
          req,
          400,
          "Administrator accounts cannot be deleted here",
        );
      try {
        await deleteAccount(target.data as Profile);
      } catch {
        return failure(
          req,
          409,
          "End active routes before deleting this account",
        );
      }
      await audit(user.id, "account_deleted", "profile", adminUser[1]);
      return reply(req, { ok: true });
    }
    if (adminUser && req.method === "PUT") {
      const update: any = {};
      if (input.name) update.full_name = String(input.name).trim();
      for (const field of ["phone", "address", "photo_url"])
        if (field in input) update[field] = input[field];
      if (input.email) update.email = String(input.email).trim().toLowerCase();
      const row = await service
        .from("profiles")
        .update(update)
        .eq("id", adminUser[1])
        .select("*")
        .single();
      if (input.email)
        await service.auth.admin.updateUserById(adminUser[1], {
          email: update.email,
        });
      return reply(req, profileOut(row.data as Profile));
    }
    const compliance = path.match(
      /^\/admin\/users\/([0-9a-f-]+)\/compliance$/i,
    );
    if (compliance && req.method === "PUT") {
      const update: any = {};
      for (const field of ["license_number", "license_expiry", "permit_expiry"])
        if (field in input) update[field] = input[field];
      await service.from("profiles").update(update).eq("id", compliance[1]);
      return reply(req, { ok: true });
    }

    if (path === "/admin/children" && req.method === "GET") {
      const rows = await service
        .from("children")
        .select("*")
        .order("full_name");
      return reply(
        req,
        await Promise.all(
          (rows.data || []).map((row: any) => enrichChild(row, true)),
        ),
      );
    }
    if (path === "/admin/children" && req.method === "POST") {
      const inserted = await service
        .from("children")
        .insert({
          parent_id: input.parent_id,
          assigned_driver_id: input.driver_id || null,
          assigned_vehicle_id: input.vehicle_id || null,
          full_name: input.name,
          school: input.school,
          home_address: input.home_address,
          school_address: input.school_address,
          pickup_time: input.pickup_time,
          dropoff_time: input.dropoff_time,
          birth_date: input.birth_date || null,
          grade: input.grade || null,
          round_trip: input.round_trip !== false,
          emergency_contact_name: input.emergency_contact_name || null,
          emergency_contact_phone: input.emergency_contact_phone || null,
          contact_phone: input.contact_phone || null,
        })
        .select("*")
        .single();
      return inserted.error
        ? failure(req, 400, inserted.error.message)
        : reply(req, childOut(inserted.data));
    }
    const assign = path.match(/^\/admin\/children\/([0-9a-f-]+)\/assign$/i);
    if (assign && req.method === "PUT") {
      const update: any = { assignment_status: "assigned" };
      if (input.driver_id) update.assigned_driver_id = input.driver_id;
      if (input.vehicle_id) update.assigned_vehicle_id = input.vehicle_id;
      const row = await service
        .from("children")
        .update(update)
        .eq("id", assign[1])
        .select("*")
        .single();
      await audit(user.id, "child_assignment_updated", "child", assign[1], {
        driver_id: update.assigned_driver_id || null,
        vehicle_id: update.assigned_vehicle_id || null,
      });
      return reply(req, childOut(row.data));
    }
    const childAccess = path.match(
      /^\/admin\/children\/([0-9a-f-]+)\/access$/i,
    );
    if (childAccess && req.method === "PUT") {
      if (!input.guardian_consent_confirmed)
        return failure(req, 400, "Confirm guardian authorization");
      if (!input.email) return failure(req, 400, "Child email is required");
      if (input.password && String(input.password).length < 12)
        return failure(req, 400, "Child passwords require at least 12 characters");
      const child = await service
        .from("children")
        .select("*")
        .eq("id", childAccess[1])
        .single();
      let accountId = child.data?.child_account_id;
      if (!accountId) {
        if (!input.password)
          return failure(req, 400, "A temporary child password is required");
        const created = await service.auth.admin.createUser({
          email: String(input.email).toLowerCase(),
          password: input.password,
          email_confirm: true,
          user_metadata: { role: "child", name: child.data.full_name },
        });
        if (created.error || !created.data.user)
          return failure(req, 400, "Unable to create child access");
        accountId = created.data.user.id;
        await service
          .from("children")
          .update({ child_account_id: accountId })
          .eq("id", childAccess[1]);
      } else {
        const changes: any = { email: String(input.email).toLowerCase() };
        if (input.password) changes.password = input.password;
        await service.auth.admin.updateUserById(accountId, changes);
      }
      const status = input.enabled === false ? "suspended" : "active";
      await service
        .from("profiles")
        .update({
          email: String(input.email).toLowerCase(),
          status,
          guardian_consent_confirmed_at: new Date().toISOString(),
          guardian_consent_confirmed_by: user.id,
        })
        .eq("id", accountId);
      return reply(req, { id: accountId, email: input.email, status });
    }
    if (childAccess && req.method === "DELETE") {
      const child = await service
        .from("children")
        .select("child_account_id")
        .eq("id", childAccess[1])
        .single();
      if (child.data?.child_account_id)
        await service.auth.admin.deleteUser(child.data.child_account_id);
      await service
        .from("children")
        .update({ child_account_id: null })
        .eq("id", childAccess[1]);
      return reply(req, { ok: true });
    }
    const adminChild = path.match(/^\/admin\/children\/([0-9a-f-]+)$/i);
    if (adminChild && req.method === "PUT") {
      const update: any = {
        parent_id: input.parent_id,
        assigned_driver_id: input.driver_id || null,
        assigned_vehicle_id: input.vehicle_id || null,
        full_name: input.name,
        school: input.school,
        home_address: input.home_address,
        school_address: input.school_address,
        pickup_time: input.pickup_time,
        dropoff_time: input.dropoff_time,
        birth_date: input.birth_date || null,
        grade: input.grade || null,
        round_trip: input.round_trip !== false,
        emergency_contact_name: input.emergency_contact_name || null,
        emergency_contact_phone: input.emergency_contact_phone || null,
        contact_phone: input.contact_phone || null,
      };
      const row = await service
        .from("children")
        .update(update)
        .eq("id", adminChild[1])
        .select("*")
        .single();
      if (row.data?.child_account_id)
        await service
          .from("profiles")
          .update({ full_name: input.name })
          .eq("id", row.data.child_account_id);
      return row.error
        ? failure(req, 400, row.error.message)
        : reply(req, childOut(row.data));
    }
    if (adminChild && req.method === "DELETE") {
      await service.from("children").delete().eq("id", adminChild[1]);
      return reply(req, { ok: true });
    }

    if (path === "/admin/vehicles" && req.method === "GET") {
      const rows = await service.from("vehicles").select("*").order("make");
      return reply(req, (rows.data || []).map(vehicleOut));
    }
    if (path === "/admin/vehicles" && req.method === "POST") {
      const inserted = await service
        .from("vehicles")
        .insert({ ...input, image_url: input.photo_url, photo_url: undefined })
        .select("*")
        .single();
      return inserted.error
        ? failure(req, 400, inserted.error.message)
        : reply(req, vehicleOut(inserted.data));
    }
    const vehicle = path.match(/^\/admin\/vehicles\/([0-9a-f-]+)$/i);
    if (vehicle && req.method === "PUT") {
      const update = {
        ...input,
        image_url: input.photo_url,
        photo_url: undefined,
      };
      const row = await service
        .from("vehicles")
        .update(update)
        .eq("id", vehicle[1])
        .select("*")
        .single();
      return reply(req, vehicleOut(row.data));
    }
    if (vehicle && req.method === "DELETE") {
      await service.from("vehicles").delete().eq("id", vehicle[1]);
      return reply(req, { ok: true });
    }

    if (path === "/admin/routes" && req.method === "GET") {
      const rows = await service.from("routes").select("*").order("name");
      const output = [];
      for (const route of rows.data || []) {
        const links = await service
          .from("route_children")
          .select("child_id,stop_order")
          .eq("route_id", route.id)
          .order("stop_order");
        const childIds = (links.data || []).map((link: any) => link.child_id);
        const children = childIds.length
          ? await service.from("children").select("*").in("id", childIds)
          : { data: [] };
        output.push({
          ...route,
          child_ids: childIds,
          children: (children.data || []).map(childOut),
        });
      }
      return reply(req, output);
    }
    if (path === "/admin/routes" && req.method === "POST") {
      const inserted = await service
        .from("routes")
        .insert({
          name: input.name,
          driver_id: input.driver_id,
          vehicle_id: input.vehicle_id || null,
          phase: input.phase || "morning",
          route_color: input.route_color || "#D4AF37",
        })
        .select("*")
        .single();
      if (inserted.error) return failure(req, 400, inserted.error.message);
      if (Array.isArray(input.child_ids))
        for (let index = 0; index < input.child_ids.length; index++)
          await service.from("route_children").insert({
            route_id: inserted.data.id,
            child_id: input.child_ids[index],
            stop_order: index + 1,
          });
      return reply(req, { ...inserted.data, child_ids: input.child_ids || [] });
    }
    const routeRecord = path.match(/^\/admin\/routes\/([0-9a-f-]+)$/i);
    if (routeRecord && req.method === "PUT") {
      const updated = await service
        .from("routes")
        .update({
          name: input.name,
          driver_id: input.driver_id,
          vehicle_id: input.vehicle_id || null,
          phase: input.phase || "morning",
          route_color: input.route_color || "#D4AF37",
        })
        .eq("id", routeRecord[1])
        .select("*")
        .single();
      if (updated.error) return failure(req, 400, updated.error.message);
      await service
        .from("route_children")
        .delete()
        .eq("route_id", routeRecord[1]);
      if (Array.isArray(input.child_ids))
        for (let index = 0; index < input.child_ids.length; index++)
          await service.from("route_children").insert({
            route_id: routeRecord[1],
            child_id: input.child_ids[index],
            stop_order: index + 1,
          });
      return reply(req, { ...updated.data, child_ids: input.child_ids || [] });
    }
    if (routeRecord && req.method === "DELETE") {
      await service.from("routes").delete().eq("id", routeRecord[1]);
      return reply(req, { ok: true });
    }

    if (path === "/admin/live-routes" && req.method === "GET") {
      const drivers = await service
        .from("profiles")
        .select("*")
        .eq("role", "driver")
        .order("full_name");
      const colors = [
        "#D4AF37",
        "#3B82F6",
        "#EF4444",
        "#10B981",
        "#A855F7",
        "#F97316",
        "#06B6D4",
        "#EC4899",
        "#84CC16",
        "#E5E7EB",
      ];
      const output = [];
      for (let index = 0; index < (drivers.data || []).length; index++) {
        const driver = drivers.data![index] as Profile;
        const children = await service
          .from("children")
          .select("*")
          .eq("assigned_driver_id", driver.id);
        const route = await service
          .from("routes")
          .select("*")
          .eq("driver_id", driver.id)
          .limit(1)
          .maybeSingle();
        const vehicleId =
          route.data?.vehicle_id ||
          children.data?.find((child: any) => child.assigned_vehicle_id)
            ?.assigned_vehicle_id;
        const vehicle = vehicleId
          ? await service
              .from("vehicles")
              .select("*")
              .eq("id", vehicleId)
              .maybeSingle()
          : { data: null };
        const tracking = await routeTracking({ assigned_driver_id: driver.id });
        output.push({
          driver: profileOut(driver),
          vehicle: vehicle.data ? vehicleOut(vehicle.data) : null,
          children: (children.data || []).map(childOut),
          location: tracking.location,
          route_id: route.data?.id,
          route_name:
            route.data?.name || `Route ${String(index + 1).padStart(2, "0")}`,
          route_color: route.data?.route_color || colors[index % colors.length],
          route_points: tracking.route_points,
          planned_route_points: tracking.planned_route_points,
        });
      }
      return reply(req, output);
    }

    if (path === "/admin/announcement" && req.method === "POST") {
      const inserted = await service
        .from("announcements")
        .insert({
          created_by: user.id,
          title: input.title,
          body: input.body,
          category: input.category || "general",
        })
        .select("*")
        .single();
      const parents = await service
        .from("profiles")
        .select("id")
        .eq("role", "parent")
        .eq("status", "active");
      await Promise.all(
        (parents.data || []).map((parent: any) =>
          notify(parent.id, "announcement", input.title, input.body, {
            category: input.category || "general",
          }),
        ),
      );
      return reply(req, inserted.data);
    }
    if (path === "/admin/schedule-requests" && req.method === "GET") {
      const rows = await service
        .from("schedule_requests")
        .select("*")
        .order("created_at", { ascending: false });
      return reply(req, (rows.data || []).map(scheduleOut));
    }
    if (path === "/admin/events" && req.method === "GET") {
      let query = service
        .from("attendance_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (url.searchParams.get("driver_id"))
        query = query.eq("driver_id", url.searchParams.get("driver_id"));
      if (url.searchParams.get("child_id"))
        query = query.eq("child_id", url.searchParams.get("child_id"));
      const rows = await query;
      return reply(req, (rows.data || []).map(eventOut));
    }
    if (path === "/admin/activity" && req.method === "GET") {
      const rows = await service
        .from("audit_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      return reply(req, rows.data || []);
    }
    if (path === "/admin/operations/today" && req.method === "GET") {
      const children = await service
        .from("children")
        .select("*")
        .order("full_name");
      const output = [];
      const counts: Record<string, number> = {
        picked_up: 0,
        pending: 0,
        absent: 0,
      };
      for (const child of children.data || []) {
        const event = await service
          .from("attendance_events")
          .select("*")
          .eq("child_id", child.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const status = ["absent", "no_show"].includes(event.data?.status)
          ? "absent"
          : [
                "picked_up",
                "arrived_school",
                "leaving_school",
                "arriving_home",
                "arrived_home",
                "alt_dropoff",
              ].includes(event.data?.status)
            ? "picked_up"
            : "pending";
        counts[status]++;
        const driver = child.assigned_driver_id
          ? await service
              .from("profiles")
              .select("*")
              .eq("id", child.assigned_driver_id)
              .maybeSingle()
          : { data: null };
        output.push({
          child: childOut(child),
          driver: driver.data ? profileOut(driver.data as Profile) : null,
          status,
          latest_event: event.data ? eventOut(event.data) : null,
        });
      }
      return reply(req, {
        date: new Date().toISOString().slice(0, 10),
        counts,
        children: output,
      });
    }
    if (path === "/admin/compliance-alerts" && req.method === "GET") {
      const today = new Date();
      const horizon = new Date(Date.now() + 30 * 86400_000);
      const alerts: any[] = [];
      const vehicles = await service.from("vehicles").select("*");
      for (const vehicle of vehicles.data || [])
        for (const field of [
          "registration_expiry",
          "insurance_expiry",
          "inspection_expiry",
        ])
          if (vehicle[field]) {
            const date = new Date(`${vehicle[field]}T00:00:00Z`);
            if (date <= horizon)
              alerts.push({
                kind: "vehicle",
                item: vehicleOut(vehicle),
                field,
                expires_on: vehicle[field],
                expired: date < today,
                days_left: Math.ceil(
                  (date.getTime() - today.getTime()) / 86400_000,
                ),
              });
          }
      const drivers = await service
        .from("profiles")
        .select("*")
        .eq("role", "driver");
      for (const driver of drivers.data || [])
        for (const field of ["license_expiry", "permit_expiry"])
          if (driver[field]) {
            const date = new Date(`${driver[field]}T00:00:00Z`);
            if (date <= horizon)
              alerts.push({
                kind: "driver",
                item: profileOut(driver as Profile),
                field,
                expires_on: driver[field],
                expired: date < today,
                days_left: Math.ceil(
                  (date.getTime() - today.getTime()) / 86400_000,
                ),
              });
          }
      return reply(req, alerts);
    }
  }

  return failure(req, 404, "Not found");
});
