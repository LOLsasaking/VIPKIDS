export type RoutePhase = 'morning' | 'afternoon';

type AssignedChild = {
  home_address?: string;
  school_address?: string;
};

function uniqueAddresses(addresses: Array<string | undefined>) {
  const seen = new Set<string>();
  return addresses
    .map((address) => address?.trim())
    .filter((address): address is string => {
      if (!address || seen.has(address.toLowerCase())) return false;
      seen.add(address.toLowerCase());
      return true;
    });
}

export function orderedRouteAddresses(children: AssignedChild[], phase: RoutePhase) {
  const homes = uniqueAddresses(children.map((child) => child.home_address));
  const schools = uniqueAddresses(children.map((child) => child.school_address));
  return phase === 'morning' ? [...homes, ...schools] : [...schools, ...homes];
}

export function buildGoogleMapsRouteUrl(children: AssignedChild[], phase: RoutePhase) {
  const stops = orderedRouteAddresses(children, phase);

  if (stops.length === 0) return null;

  const destination = stops.at(-1)!;
  const waypoints = stops.slice(0, -1);
  const parameters = [
    'api=1',
    `destination=${encodeURIComponent(destination)}`,
    'travelmode=driving',
    'dir_action=navigate',
    ...(waypoints.length > 0 ? [`waypoints=${waypoints.map(encodeURIComponent).join('%7C')}`] : []),
    'utm_source=vip_kids_transportation',
    'utm_campaign=assigned_route_navigation',
  ];

  return `https://www.google.com/maps/dir/?${parameters.join('&')}`;
}
