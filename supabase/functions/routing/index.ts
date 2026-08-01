import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const googleKey = Deno.env.get("GOOGLE_ROUTES_API_KEY") || "";
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function decodePolyline(encoded: string) {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0,
    latitude = 0,
    longitude = 0;
  while (index < encoded.length) {
    let result = 0,
      shift = 0,
      byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: latitude / 1e5, lng: longitude / 1e5 });
  }
  return points;
}

Deno.serve(async (req) => {
  if (req.method !== "POST")
    return new Response(JSON.stringify({ detail: "Method not allowed" }), {
      status: 405,
    });
  const token = (req.headers.get("authorization") || "").replace(
    /^Bearer /,
    "",
  );
  const auth = await supabase.auth.getUser(token);
  if (auth.error || !auth.data.user)
    return new Response(JSON.stringify({ detail: "Not authenticated" }), {
      status: 401,
    });
  const profile = await supabase
    .from("profiles")
    .select("role,status")
    .eq("id", auth.data.user.id)
    .maybeSingle();
  if (profile.data?.role !== "driver" || profile.data?.status !== "active")
    return new Response(JSON.stringify({ detail: "Driver access required" }), {
      status: 403,
    });
  if (!googleKey)
    return new Response(
      JSON.stringify({ detail: "Routing provider is not configured" }),
      { status: 503 },
    );

  const input = await req.json().catch(() => ({}));
  const coordinates = Array.isArray(input.coordinates) ? input.coordinates : [];
  if (
    coordinates.length < 2 ||
    coordinates.length > 25 ||
    coordinates.some(
      (point: any) =>
        !Number.isFinite(point?.lat) || !Number.isFinite(point?.lng),
    )
  ) {
    return new Response(
      JSON.stringify({ detail: "Provide 2–25 valid route coordinates" }),
      { status: 400 },
    );
  }
  const waypoint = (point: any) => ({
    location: { latLng: { latitude: point.lat, longitude: point.lng } },
  });
  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleKey,
        "X-Goog-FieldMask":
          "routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: waypoint(coordinates[0]),
        destination: waypoint(coordinates[coordinates.length - 1]),
        intermediates: coordinates.slice(1, -1).map(waypoint),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        polylineQuality: "HIGH_QUALITY",
      }),
    },
  );
  if (!response.ok)
    return new Response(JSON.stringify({ detail: "Routing provider failed" }), {
      status: 502,
    });
  const result = await response.json();
  const route = result.routes?.[0];
  const points = route?.polyline?.encodedPolyline
    ? decodePolyline(route.polyline.encodedPolyline)
    : [];
  return new Response(
    JSON.stringify({
      points,
      distance_meters: route?.distanceMeters,
      duration: route?.duration,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
